const express = require("express");
const cors = require("cors");
const sqlite3 = require("sqlite3").verbose();
const dns = require("dns").promises;

const app = express();

const PORT = process.env.PORT || 5001;
const HOST = "0.0.0.0";

// CORS setup
app.use(
  cors({
    origin: ["http://localhost:5173", process.env.FRONTEND_URL].filter(Boolean),
  })
);

app.use(express.json());

const db = new sqlite3.Database("./domainpulse.db");

// Create tables
db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS domains (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      domain TEXT UNIQUE NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS nameserver_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      domain_id INTEGER NOT NULL,
      domain TEXT NOT NULL,
      nameservers TEXT NOT NULL,
      checked_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS alerts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      domain TEXT NOT NULL,
      old_nameservers TEXT NOT NULL,
      new_nameservers TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
});

function cleanDomain(domain) {
  return domain
    .replace("https://", "")
    .replace("http://", "")
    .replace("www.", "")
    .split("/")[0]
    .trim()
    .toLowerCase();
}

async function getNameservers(domain) {
  try {
    const ns = await dns.resolveNs(domain);
    return ns.map((item) => item.toLowerCase()).sort();
  } catch (error) {
    return [];
  }
}

// Home route
app.get("/", (req, res) => {
  res.json({
    message: "DomainPulse backend is running",
    routes: [
      "GET /api/domains",
      "POST /api/domains",
      "DELETE /api/domains/:id",
      "POST /api/domains/:id/check",
      "POST /api/check-all",
      "GET /api/alerts",
      "DELETE /api/alerts",
      "GET /api/stats",
      "GET /api/domains/:id/history",
    ],
  });
});

// Get all domains
app.get("/api/domains", (req, res) => {
  db.all("SELECT * FROM domains ORDER BY id DESC", [], (err, rows) => {
    if (err) {
      return res.status(500).json({ error: "Failed to fetch domains" });
    }

    res.json(rows);
  });
});

// Add domain
app.post("/api/domains", async (req, res) => {
  const { domain } = req.body;

  if (!domain) {
    return res.status(400).json({ error: "Domain is required" });
  }

  const cleanedDomain = cleanDomain(domain);
  const nameservers = await getNameservers(cleanedDomain);

  db.run(
    "INSERT INTO domains (domain) VALUES (?)",
    [cleanedDomain],
    function (err) {
      if (err) {
        return res.status(400).json({
          error: "Domain already exists or invalid domain",
        });
      }

      const domainId = this.lastID;

      db.run(
        `
        INSERT INTO nameserver_history 
        (domain_id, domain, nameservers) 
        VALUES (?, ?, ?)
        `,
        [domainId, cleanedDomain, JSON.stringify(nameservers)]
      );

      res.json({
        message: "Domain added successfully",
        id: domainId,
        domain: cleanedDomain,
        nameservers,
      });
    }
  );
});

// Delete domain
app.delete("/api/domains/:id", (req, res) => {
  const { id } = req.params;

  db.run("DELETE FROM domains WHERE id = ?", [id], function (err) {
    if (err) {
      return res.status(500).json({ error: "Failed to delete domain" });
    }

    db.run("DELETE FROM nameserver_history WHERE domain_id = ?", [id]);

    res.json({ message: "Domain deleted successfully" });
  });
});

// Check one domain
app.post("/api/domains/:id/check", (req, res) => {
  const { id } = req.params;

  db.get("SELECT * FROM domains WHERE id = ?", [id], async (err, domainRow) => {
    if (err || !domainRow) {
      return res.status(404).json({ error: "Domain not found" });
    }

    const newNameservers = await getNameservers(domainRow.domain);

    db.get(
      `
      SELECT * FROM nameserver_history 
      WHERE domain_id = ? 
      ORDER BY checked_at DESC 
      LIMIT 1
      `,
      [id],
      (historyErr, lastHistory) => {
        if (historyErr) {
          return res.status(500).json({ error: "Failed to check history" });
        }

        const oldNameservers = lastHistory
          ? JSON.parse(lastHistory.nameservers)
          : [];

        const oldText = JSON.stringify(oldNameservers);
        const newText = JSON.stringify(newNameservers);

        db.run(
          `
          INSERT INTO nameserver_history 
          (domain_id, domain, nameservers) 
          VALUES (?, ?, ?)
          `,
          [id, domainRow.domain, newText]
        );

        if (oldText !== newText) {
          db.run(
            `
            INSERT INTO alerts 
            (domain, old_nameservers, new_nameservers) 
            VALUES (?, ?, ?)
            `,
            [domainRow.domain, oldText, newText]
          );
        }

        res.json({
          message:
            oldText !== newText
              ? "Nameserver changed"
              : "No nameserver change",
          domain: domainRow.domain,
          oldNameservers,
          newNameservers,
          changed: oldText !== newText,
        });
      }
    );
  });
});

// Check all domains
app.post("/api/check-all", (req, res) => {
  db.all("SELECT * FROM domains", [], async (err, domains) => {
    if (err) {
      return res.status(500).json({ error: "Failed to fetch domains" });
    }

    const results = [];

    for (const domainRow of domains) {
      const newNameservers = await getNameservers(domainRow.domain);

      const lastHistory = await new Promise((resolve) => {
        db.get(
          `
          SELECT * FROM nameserver_history 
          WHERE domain_id = ? 
          ORDER BY checked_at DESC 
          LIMIT 1
          `,
          [domainRow.id],
          (historyErr, row) => {
            resolve(row);
          }
        );
      });

      const oldNameservers = lastHistory
        ? JSON.parse(lastHistory.nameservers)
        : [];

      const oldText = JSON.stringify(oldNameservers);
      const newText = JSON.stringify(newNameservers);

      await new Promise((resolve) => {
        db.run(
          `
          INSERT INTO nameserver_history 
          (domain_id, domain, nameservers) 
          VALUES (?, ?, ?)
          `,
          [domainRow.id, domainRow.domain, newText],
          resolve
        );
      });

      if (oldText !== newText) {
        await new Promise((resolve) => {
          db.run(
            `
            INSERT INTO alerts 
            (domain, old_nameservers, new_nameservers) 
            VALUES (?, ?, ?)
            `,
            [domainRow.domain, oldText, newText],
            resolve
          );
        });
      }

      results.push({
        domain: domainRow.domain,
        changed: oldText !== newText,
        oldNameservers,
        newNameservers,
      });
    }

    res.json({
      message: "All domains checked",
      results,
    });
  });
});

// Get alerts
app.get("/api/alerts", (req, res) => {
  db.all("SELECT * FROM alerts ORDER BY id DESC", [], (err, rows) => {
    if (err) {
      return res.status(500).json({ error: "Failed to fetch alerts" });
    }

    const alerts = rows.map((alert) => ({
      ...alert,
      old_nameservers: JSON.parse(alert.old_nameservers),
      new_nameservers: JSON.parse(alert.new_nameservers),
    }));

    res.json(alerts);
  });
});

// Clear alerts
app.delete("/api/alerts", (req, res) => {
  db.run("DELETE FROM alerts", [], function (err) {
    if (err) {
      return res.status(500).json({ error: "Failed to clear alerts" });
    }

    res.json({ message: "Alerts cleared successfully" });
  });
});

// Stats
app.get("/api/stats", (req, res) => {
  db.get("SELECT COUNT(*) as totalDomains FROM domains", [], (err, domainRow) => {
    if (err) {
      return res.status(500).json({ error: "Failed to fetch stats" });
    }

    db.get(
      "SELECT COUNT(*) as totalAlerts FROM alerts",
      [],
      (alertErr, alertRow) => {
        if (alertErr) {
          return res.status(500).json({ error: "Failed to fetch alerts count" });
        }

        res.json({
          totalDomains: domainRow.totalDomains,
          totalAlerts: alertRow.totalAlerts,
        });
      }
    );
  });
});

// Get nameserver history for one domain
app.get("/api/domains/:id/history", (req, res) => {
  const { id } = req.params;

  db.all(
    `
    SELECT * FROM nameserver_history 
    WHERE domain_id = ? 
    ORDER BY checked_at DESC
    `,
    [id],
    (err, rows) => {
      if (err) {
        return res.status(500).json({ error: "Failed to fetch history" });
      }

      const history = rows.map((row) => ({
        ...row,
        nameservers: JSON.parse(row.nameservers),
      }));

      res.json(history);
    }
  );
});

app.listen(PORT, HOST, () => {
  console.log(`Backend running on port ${PORT}`);
});