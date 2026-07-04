require("dotenv").config();

const express = require("express");
const cors = require("cors");
const dns = require("dns").promises;
const { Pool } = require("pg");

const app = express();

const PORT = process.env.PORT || 5001;

app.use(cors());
app.use(express.json());

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is missing. Add it inside backend/.env");
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false,
  },
});

async function createTables() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS domains (
      id SERIAL PRIMARY KEY,
      domain TEXT UNIQUE NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS ns_history (
      id SERIAL PRIMARY KEY,
      domain TEXT NOT NULL,
      nameservers TEXT[] NOT NULL,
      checked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  console.log("PostgreSQL tables ready");
}

createTables().catch((error) => {
  console.error("Database setup error:", error.message);
});

app.get("/", (req, res) => {
  res.json({
    message: "DomainPulse backend running",
    routes: ["/api/domains", "/api/check/:domain", "/api/history/:domain"],
  });
});

app.get("/api/domains", async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT * FROM domains ORDER BY created_at DESC"
    );

    res.json(result.rows);
  } catch (error) {
    console.error("Get domains error:", error.message);
    res.status(500).json({
      message: "Failed to get domains",
      error: error.message,
    });
  }
});

app.post("/api/domains", async (req, res) => {
  try {
    const { domain } = req.body;

    if (!domain) {
      return res.status(400).json({ message: "Domain is required" });
    }

    const cleanDomain = domain
      .trim()
      .toLowerCase()
      .replace("https://", "")
      .replace("http://", "")
      .replace("www.", "")
      .replace(/\/$/, "");

    const result = await pool.query(
      "INSERT INTO domains (domain) VALUES ($1) RETURNING *",
      [cleanDomain]
    );

    res.status(201).json({
      message: "Domain added",
      domain: result.rows[0],
    });
  } catch (error) {
    if (error.code === "23505") {
      return res.status(409).json({
        message: "Domain already exists",
      });
    }

    console.error("Add domain error:", error.message);

    res.status(500).json({
      message: "Failed to add domain",
      error: error.message,
    });
  }
});

app.post("/api/check/:domain", async (req, res) => {
  try {
    const domain = req.params.domain.toLowerCase();

    const nameservers = await dns.resolveNs(domain);

    const historyResult = await pool.query(
      "SELECT * FROM ns_history WHERE domain = $1 ORDER BY checked_at DESC LIMIT 1",
      [domain]
    );

    let changed = false;

    if (historyResult.rows.length > 0) {
      const oldNameservers = historyResult.rows[0].nameservers || [];

      changed =
        JSON.stringify([...oldNameservers].sort()) !==
        JSON.stringify([...nameservers].sort());
    }

    await pool.query(
      "INSERT INTO ns_history (domain, nameservers) VALUES ($1, $2)",
      [domain, nameservers]
    );

    res.json({
      domain,
      nameservers,
      changed,
    });
  } catch (error) {
    console.error("Check domain error:", error.message);

    res.status(500).json({
      message: "Failed to check nameservers",
      error: error.message,
    });
  }
});

app.get("/api/history/:domain", async (req, res) => {
  try {
    const domain = req.params.domain.toLowerCase();

    const result = await pool.query(
      "SELECT * FROM ns_history WHERE domain = $1 ORDER BY checked_at DESC",
      [domain]
    );

    res.json({
      domain,
      history: result.rows,
    });
  } catch (error) {
    console.error("History error:", error.message);

    res.status(500).json({
      message: "Failed to get history",
      error: error.message,
    });
  }
});

app.listen(PORT, () => {
  console.log(`Backend running on port ${PORT}`);
});