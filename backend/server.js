import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import dotenv from "dotenv";
import pg from "pg";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import { OAuth2Client } from "google-auth-library";
import { createEmailService } from "./services/email.js";
import {
  createMonitoringService,
  MonitoringError,
} from "./services/monitoring.js";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5001;
const SESSION_COOKIE = "domainpulse_session";
const SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000;
const isProduction = process.env.NODE_ENV === "production";
const { Pool } = pg;

const requiredEnvironmentVariables = [
  "DATABASE_URL",
  "GOOGLE_CLIENT_ID",
  "JWT_SECRET",
];

for (const variable of requiredEnvironmentVariables) {
  if (!process.env[variable]) {
    throw new Error(`${variable} is required`);
  }
}

const allowedOrigins = new Set(
  [
    process.env.FRONTEND_URL,
    "http://localhost:5173",
    "http://127.0.0.1:5173",
  ].filter(Boolean)
);

app.use(
  cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.has(origin)) {
        return callback(null, true);
      }

      return callback(new Error("Origin is not allowed by CORS"));
    },
    credentials: true,
  })
);
app.use(express.json());
app.use(cookieParser());

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: isProduction ? { rejectUnauthorized: false } : undefined,
});

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);
const emailService = createEmailService();
const monitoringService = createMonitoringService({ pool, emailService });

function sessionCookieOptions() {
  return {
    httpOnly: true,
    secure: isProduction,
    sameSite: "lax",
    maxAge: SESSION_DURATION_MS,
    path: "/",
  };
}

function createSessionToken(user) {
  return jwt.sign(
    { sub: String(user.id), email: user.email },
    process.env.JWT_SECRET,
    { expiresIn: "7d", issuer: "domainpulse-api" }
  );
}

async function setupDatabase() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      google_sub TEXT UNIQUE,
      email TEXT UNIQUE NOT NULL,
      name TEXT,
      picture TEXT,
      email_alerts_enabled BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    ALTER TABLE users ADD COLUMN IF NOT EXISTS google_sub TEXT;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS name TEXT;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS picture TEXT;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS email_alerts_enabled BOOLEAN NOT NULL DEFAULT TRUE;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
    ALTER TABLE users ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

    CREATE UNIQUE INDEX IF NOT EXISTS users_google_sub_unique ON users (google_sub);
    CREATE UNIQUE INDEX IF NOT EXISTS users_email_unique ON users (email);

    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'users'
          AND column_name = 'google_id'
      ) THEN
        ALTER TABLE users ALTER COLUMN google_id DROP NOT NULL;
      END IF;
    END $$;

    CREATE TABLE IF NOT EXISTS domains (
      id SERIAL PRIMARY KEY,
      domain TEXT NOT NULL,
      nameservers TEXT[] DEFAULT '{}',
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      checked_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    ALTER TABLE domains
      ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES users(id) ON DELETE CASCADE;

    ALTER TABLE domains
      ADD COLUMN IF NOT EXISTS checked_at TIMESTAMPTZ;

    ALTER TABLE domains
      DROP CONSTRAINT IF EXISTS domains_domain_key;

    CREATE UNIQUE INDEX IF NOT EXISTS domains_user_domain_unique
      ON domains (user_id, domain);

    CREATE TABLE IF NOT EXISTS domain_monitoring_history (
      id BIGSERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      domain_id INTEGER NOT NULL REFERENCES domains(id) ON DELETE CASCADE,
      event_type TEXT NOT NULL CHECK (event_type IN ('baseline', 'change')),
      previous_nameservers TEXT[] NOT NULL DEFAULT '{}',
      current_nameservers TEXT[] NOT NULL DEFAULT '{}',
      source TEXT NOT NULL CHECK (source IN ('manual', 'scheduled')),
      checked_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS monitoring_history_domain_checked_idx
      ON domain_monitoring_history (domain_id, checked_at DESC);

    CREATE TABLE IF NOT EXISTS domain_alerts (
      id BIGSERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      domain_id INTEGER NOT NULL REFERENCES domains(id) ON DELETE CASCADE,
      alert_type TEXT NOT NULL,
      previous_nameservers TEXT[] NOT NULL DEFAULT '{}',
      current_nameservers TEXT[] NOT NULL DEFAULT '{}',
      email_status TEXT NOT NULL DEFAULT 'pending',
      email_provider_id TEXT,
      email_error TEXT,
      email_sent_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS domain_alerts_user_created_idx
      ON domain_alerts (user_id, created_at DESC);
  `);
}

setupDatabase()
  .then(() => console.log("PostgreSQL tables ready"))
  .catch((error) => {
    console.error("Database setup error:", error);
    process.exit(1);
  });

async function requireAuth(req, res, next) {
  const token = req.cookies[SESSION_COOKIE];

  if (!token) {
    return res.status(401).json({ message: "Authentication required" });
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET, {
      issuer: "domainpulse-api",
    });
    const userId = Number(payload.sub);

    if (!Number.isInteger(userId)) {
      throw new Error("Invalid session user");
    }

    const result = await pool.query(
      "SELECT id, email, name, picture, created_at FROM users WHERE id = $1",
      [userId]
    );

    if (!result.rows[0]) {
      throw new Error("Session user no longer exists");
    }

    req.user = result.rows[0];
    next();
  } catch {
    res.clearCookie(SESSION_COOKIE, sessionCookieOptions());
    return res.status(401).json({ message: "Session expired" });
  }
}

function requireCronSecret(req, res, next) {
  const expected = process.env.CRON_SECRET;
  const provided = req.get("authorization")?.replace(/^Bearer\s+/i, "") || "";

  if (!expected) {
    return res.status(503).json({ message: "Scheduled monitoring is not configured" });
  }

  const expectedBuffer = Buffer.from(expected);
  const providedBuffer = Buffer.from(provided);
  const matches =
    expectedBuffer.length === providedBuffer.length &&
    crypto.timingSafeEqual(expectedBuffer, providedBuffer);

  if (!matches) {
    return res.status(401).json({ message: "Invalid scheduler credential" });
  }

  next();
}

app.get("/", (req, res) => {
  res.json({ message: "DomainPulse backend running" });
});

app.post("/api/auth/google", async (req, res) => {
  try {
    const { credential } = req.body;

    if (!credential) {
      return res.status(400).json({ message: "Google credential is required" });
    }

    const ticket = await googleClient.verifyIdToken({
      idToken: credential,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
    const profile = ticket.getPayload();

    if (!profile?.sub || !profile.email || !profile.email_verified) {
      return res.status(401).json({ message: "Google account could not be verified" });
    }

    const normalizedEmail = profile.email.toLowerCase();
    const existingUser = await pool.query(
      `
        SELECT id
        FROM users
        WHERE google_sub = $1 OR LOWER(email) = $2
        ORDER BY CASE WHEN google_sub = $1 THEN 0 ELSE 1 END
        LIMIT 1
      `,
      [profile.sub, normalizedEmail]
    );

    const result = existingUser.rows[0]
      ? await pool.query(
          `
            UPDATE users
            SET google_sub = $1, email = $2, name = $3, picture = $4, updated_at = NOW()
            WHERE id = $5
            RETURNING id, email, name, picture, created_at
          `,
          [
            profile.sub,
            normalizedEmail,
            profile.name || profile.email,
            profile.picture || null,
            existingUser.rows[0].id,
          ]
        )
      : await pool.query(
          `
            INSERT INTO users (google_sub, email, name, picture)
            VALUES ($1, $2, $3, $4)
            RETURNING id, email, name, picture, created_at
          `,
          [
            profile.sub,
            normalizedEmail,
            profile.name || profile.email,
            profile.picture || null,
          ]
        );

    const user = result.rows[0];
    const legacyOwnerEmail = process.env.LEGACY_OWNER_EMAIL?.trim().toLowerCase();

    if (legacyOwnerEmail && user.email.toLowerCase() === legacyOwnerEmail) {
      await pool.query(
        "UPDATE domains SET user_id = $1 WHERE user_id IS NULL",
        [user.id]
      );
    }

    res.cookie(SESSION_COOKIE, createSessionToken(user), sessionCookieOptions());
    res.json({ user });
  } catch (error) {
    console.error("Google authentication error:", error);
    res.status(401).json({ message: "Google sign-in failed" });
  }
});

app.get("/api/auth/me", requireAuth, (req, res) => {
  res.json({ user: req.user });
});

app.post("/api/auth/logout", (req, res) => {
  res.clearCookie(SESSION_COOKIE, sessionCookieOptions());
  res.json({ message: "Signed out" });
});

app.get("/api/domains", requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT * FROM domains WHERE user_id = $1 ORDER BY created_at DESC",
      [req.user.id]
    );

    res.json(result.rows);
  } catch (error) {
    console.error("Fetch domains error:", error);
    res.status(500).json({ message: "Failed to fetch domains" });
  }
});

app.post("/api/domains", requireAuth, async (req, res) => {
  try {
    const { domain } = req.body;

    if (!domain) {
      return res.status(400).json({ message: "Domain is required" });
    }

    const cleanDomain = domain.trim().toLowerCase();

    if (!/^(?!-)(?:[a-z0-9-]{1,63}\.)+[a-z]{2,}$/i.test(cleanDomain)) {
      return res.status(400).json({ message: "Enter a valid domain" });
    }

    const result = await pool.query(
      `
        INSERT INTO domains (domain, nameservers, user_id)
        VALUES ($1, $2, $3)
        RETURNING *
      `,
      [cleanDomain, [], req.user.id]
    );

    res.status(201).json({
      message: "Domain added",
      domain: result.rows[0],
    });
  } catch (error) {
    if (error.code === "23505") {
      return res.status(409).json({ message: "Domain already exists in your account" });
    }

    console.error("Add domain error:", error);
    res.status(500).json({ message: "Failed to add domain" });
  }
});

app.post("/api/check/:domain", requireAuth, async (req, res) => {
  try {
    const domain = req.params.domain.trim().toLowerCase();
    const result = await monitoringService.checkDomain({
      domain,
      userId: req.user.id,
      source: "manual",
    });

    res.json(result);
  } catch (error) {
    console.error("Check domain error:", error);
    if (error instanceof MonitoringError) {
      return res.status(error.statusCode).json({ message: error.message });
    }
    res.status(500).json({ message: "Failed to check domain" });
  }
});

app.get("/api/history/:domain", requireAuth, async (req, res) => {
  try {
    const domain = req.params.domain.trim().toLowerCase();
    const result = await pool.query(
      `
        SELECT
          h.id,
          h.event_type,
          h.previous_nameservers,
          h.current_nameservers,
          h.source,
          h.checked_at
        FROM domain_monitoring_history h
        JOIN domains d ON d.id = h.domain_id
        WHERE d.domain = $1 AND d.user_id = $2
        ORDER BY h.checked_at DESC
        LIMIT 100
      `,
      [domain, req.user.id]
    );

    res.json(result.rows);
  } catch (error) {
    console.error("Fetch history error:", error);
    res.status(500).json({ message: "Failed to fetch domain history" });
  }
});

app.post(
  "/api/internal/run-monitoring",
  requireCronSecret,
  async (req, res) => {
    try {
      const startedAt = new Date();
      const summary = await monitoringService.runScheduledChecks();

      res.json({
        message: "Scheduled monitoring completed",
        started_at: startedAt.toISOString(),
        finished_at: new Date().toISOString(),
        ...summary,
      });
    } catch (error) {
      console.error("Scheduled monitoring error:", error);
      res.status(500).json({ message: "Scheduled monitoring failed" });
    }
  }
);

app.delete("/api/domains/:domain", requireAuth, async (req, res) => {
  try {
    const domain = req.params.domain.trim().toLowerCase();
    const result = await pool.query(
      "DELETE FROM domains WHERE domain = $1 AND user_id = $2 RETURNING domain",
      [domain, req.user.id]
    );

    if (!result.rows[0]) {
      return res.status(404).json({ message: "Domain not found in your account" });
    }

    res.json({ message: `${domain} deleted` });
  } catch (error) {
    console.error("Delete domain error:", error);
    res.status(500).json({ message: "Failed to delete domain" });
  }
});

app.use((error, req, res, next) => {
  if (error.message === "Origin is not allowed by CORS") {
    return res.status(403).json({ message: error.message });
  }

  next(error);
});

app.listen(PORT, () => {
  console.log(`Backend running on port ${PORT}`);
});
