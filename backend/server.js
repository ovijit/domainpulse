import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import pg from "pg";
import dns from "dns/promises";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5001;

const { Pool } = pg;

app.use(cors());
app.use(express.json());

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false,
  },
});

async function setupDatabase() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS domains (
      id SERIAL PRIMARY KEY,
      domain TEXT UNIQUE NOT NULL,
      nameservers TEXT[],
      created_at TIMESTAMP DEFAULT NOW()
    );
  `);
}

setupDatabase()
  .then(() => console.log("PostgreSQL tables ready"))
  .catch((err) => console.error("Database setup error:", err));

app.get("/", (req, res) => {
  res.json({ message: "DomainPulse backend running" });
});

app.get("/api/domains", async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT * FROM domains ORDER BY created_at DESC"
    );

    res.json(result.rows);
  } catch (error) {
    console.error("Fetch domains error:", error);
    res.status(500).json({ message: "Failed to fetch domains" });
  }
});

app.post("/api/domains", async (req, res) => {
  try {
    const { domain } = req.body;

    if (!domain) {
      return res.status(400).json({ message: "Domain is required" });
    }

    const cleanDomain = domain.trim().toLowerCase();

    const result = await pool.query(
      "INSERT INTO domains (domain, nameservers) VALUES ($1, $2) RETURNING *",
      [cleanDomain, []]
    );

    res.status(201).json({
      message: "Domain added",
      domain: result.rows[0],
    });
  } catch (error) {
    if (error.code === "23505") {
      return res.status(409).json({ message: "Domain already exists" });
    }

    console.error("Add domain error:", error);
    res.status(500).json({ message: "Failed to add domain" });
  }
});

app.post("/api/check/:domain", async (req, res) => {
  try {
    const domain = req.params.domain.trim().toLowerCase();

    let nameservers = [];

    try {
      nameservers = await dns.resolveNs(domain);
      nameservers = nameservers.map((ns) => ns.toLowerCase()).sort();
    } catch {
      nameservers = [];
    }

    const oldResult = await pool.query(
      "SELECT nameservers FROM domains WHERE domain = $1",
      [domain]
    );

    const oldNameservers = oldResult.rows[0]?.nameservers || [];

    const changed =
      JSON.stringify(oldNameservers.sort()) !== JSON.stringify(nameservers);

    await pool.query(
      "UPDATE domains SET nameservers = $1 WHERE domain = $2",
      [nameservers, domain]
    );

    res.json({
      domain,
      nameservers,
      changed,
    });
  } catch (error) {
    console.error("Check domain error:", error);
    res.status(500).json({ message: "Failed to check domain" });
  }
});

app.listen(PORT, () => {
  console.log(`Backend running on port ${PORT}`);
});