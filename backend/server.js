import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import dotenv from "dotenv";
import pg from "pg";
import dns from "dns/promises";
import jwt from "jsonwebtoken";
import { OAuth2Client } from "google-auth-library";

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
      google_sub TEXT UNIQUE NOT NULL,
      email TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      picture TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

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

    const result = await pool.query(
      `
        INSERT INTO users (google_sub, email, name, picture)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (google_sub)
        DO UPDATE SET
          email = EXCLUDED.email,
          name = EXCLUDED.name,
          picture = EXCLUDED.picture,
          updated_at = NOW()
        RETURNING id, email, name, picture, created_at
      `,
      [profile.sub, profile.email.toLowerCase(), profile.name || profile.email, profile.picture || null]
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
    const existingResult = await pool.query(
      "SELECT id, nameservers FROM domains WHERE domain = $1 AND user_id = $2",
      [domain, req.user.id]
    );
    const existingDomain = existingResult.rows[0];

    if (!existingDomain) {
      return res.status(404).json({ message: "Domain not found in your account" });
    }

    let nameservers;

    try {
      nameservers = await dns.resolveNs(domain);
      nameservers = nameservers.map((ns) => ns.toLowerCase()).sort();
    } catch (error) {
      console.error(`DNS lookup failed for ${domain}:`, error.code || error.message);
      return res.status(422).json({
        message: `Nameservers could not be resolved for ${domain}. Check the spelling and DNS configuration.`,
      });
    }

    const oldNameservers = [...(existingDomain.nameservers || [])].sort();
    const changed =
      oldNameservers.length > 0 &&
      JSON.stringify(oldNameservers) !== JSON.stringify(nameservers);

    const updateResult = await pool.query(
      `
        UPDATE domains
        SET nameservers = $1, checked_at = NOW()
        WHERE id = $2 AND user_id = $3
        RETURNING checked_at
      `,
      [nameservers, existingDomain.id, req.user.id]
    );

    res.json({
      domain,
      nameservers,
      changed,
      checked_at: updateResult.rows[0].checked_at,
    });
  } catch (error) {
    console.error("Check domain error:", error);
    res.status(500).json({ message: "Failed to check domain" });
  }
});

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
