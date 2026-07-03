const express = require("express");
const cors = require("cors");
const dns = require("dns").promises;
require("dotenv").config();

const pool = require("./db");

const app = express();
const PORT = process.env.PORT || 5001;

app.use(cors());
app.use(express.json());

// Create tables
async function initDB() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS domains (
      id SERIAL PRIMARY KEY,
      domain TEXT UNIQUE NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS ns_history (
      id SERIAL PRIMARY KEY,
      domain TEXT NOT NULL,
      nameservers JSONB NOT NULL,
      checked_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS alerts (
      id SERIAL PRIMARY KEY,
      domain TEXT NOT NULL,
      old_nameservers JSONB,
      new_nameservers JSONB,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  console.log("PostgreSQL tables ready");
}

initDB().catch((err) => {
  console.error("Database init error:", err);
});

// Home route
app.get("/", (req, res) => {
  res.json({ message: "DomainPulse backend running with PostgreSQL" });
});

// Add domain
app.post("/api/domains", async (req, res) => {
  try {
    const { domain } = req.body;

    if (!domain) {
      return res.status(400).json({ error: "Domain is required" });
    }

    const cleanDomain = domain.toLowerCase().trim();

    const result = await pool.query(
      `INSERT INTO domains (domain)
       VALUES ($1)
       ON CONFLICT (domain) DO NOTHING
       RETURNING *`,
      [cleanDomain]
    );

    if (result.rows.length === 0) {
      return res.json({ message: "Domain already exists", domain: cleanDomain });
    }

    res.json({ message: "Domain added", domain: result.rows[0] });
  } catch (error) {
    console.error("Add domain error:", error);
    res.status(500).json({ error: "Server error" });
  }
});

// Get all domains
app.get("/api/domains", async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT * FROM domains ORDER BY created_at DESC`
    );

    res.json(result.rows);
  } catch (error) {
    console.error("Get domains error:", error);
    res.status(500).json({ error: "Server error" });
  }
});

// Delete domain
app.delete("/api/domains/:domain", async (req, res) => {
  try {
    const domain = req.params.domain.toLowerCase().trim();

    await pool.query(`DELETE FROM domains WHERE domain = $1`, [domain]);

    res.json({ message: "Domain deleted", domain });
  } catch (error) {
    console.error("Delete domain error:", error);
    res.status(500).json({ error: "Server error" });
  }
});

// Check nameservers and save history
app.post("/api/check/:domain", async (req, res) => {
  try {
    const domain = req.params.domain.toLowerCase().trim();

    const nameservers = await dns.resolveNs(domain);

    const latestHistory = await pool.query(
      `SELECT nameservers
       FROM ns_history
       WHERE domain = $1
       ORDER BY checked_at DESC
       LIMIT 1`,
      [domain]
    );

    const oldNameservers =
      latestHistory.rows.length > 0 ? latestHistory.rows[0].nameservers : null;

    await pool.query(
      `INSERT INTO ns_history (domain, nameservers)
       VALUES ($1, $2)`,
      [domain, JSON.stringify(nameservers)]
    );

    const changed =
      oldNameservers &&
      JSON.stringify([...oldNameservers].sort()) !==
        JSON.stringify([...nameservers].sort());

    if (changed) {
      await pool.query(
        `INSERT INTO alerts (domain, old_nameservers, new_nameservers)
         VALUES ($1, $2, $3)`,
        [
          domain,
          JSON.stringify(oldNameservers),
          JSON.stringify(nameservers),
        ]
      );
    }

    res.json({
      domain,
      nameservers,
      changed: Boolean(changed),
    });
  } catch (error) {
    console.error("Check nameserver error:", error);
    res.status(500).json({
      error: "Could not check nameservers",
      details: error.message,
    });
  }
});

// Get history for one domain
app.get("/api/history/:domain", async (req, res) => {
  try {
    const domain = req.params.domain.toLowerCase().trim();

    const result = await pool.query(
      `SELECT domain, nameservers, checked_at
       FROM ns_history
       WHERE domain = $1
       ORDER BY checked_at DESC`,
      [domain]
    );

    res.json({
      domain,
      history: result.rows,
    });
  } catch (error) {
    console.error("History error:", error);
    res.status(500).json({ error: "Server error" });
  }
});

// Get alerts
app.get("/api/alerts", async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT *
       FROM alerts
       ORDER BY created_at DESC`
    );

    res.json(result.rows);
  } catch (error) {
    console.error("Alerts error:", error);
    res.status(500).json({ error: "Server error" });
  }
});

app.listen(PORT, () => {
  console.log(`Backend running on port ${PORT}`);
});