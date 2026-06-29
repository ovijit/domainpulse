const express = require("express");
const cors = require("cors");
const sqlite3 = require("sqlite3").verbose();
const dns = require("dns").promises;
const cron = require("node-cron");

const app = express();
const PORT = 5001;

app.use(cors());
app.use(express.json());

const db = new sqlite3.Database("./domainpulse.db");

db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS domains (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      domain TEXT UNIQUE NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS nameserver_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      domain_id INTEGER NOT NULL,
      nameservers TEXT NOT NULL,
      checked_at TEXT DEFAULT CURRENT_TIMESTAMP,
      changed INTEGER DEFAULT 0,
      FOREIGN KEY (domain_id) REFERENCES domains(id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS alerts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      domain_id INTEGER NOT NULL,
      alert_type TEXT NOT NULL,
      message TEXT NOT NULL,
      old_value TEXT,
      new_value TEXT,
      is_read INTEGER DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (domain_id) REFERENCES domains(id)
    )
  `);
});

async function getNameservers(domain) {
  const nameservers = await dns.resolveNs(domain);
  return nameservers.map((ns) => ns.toLowerCase()).sort();
}

function getDomainById(id) {
  return new Promise((resolve, reject) => {
    db.get(`SELECT * FROM domains WHERE id = ?`, [id], (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

function getLatestHistory(domainId) {
  return new Promise((resolve, reject) => {
    db.get(
      `
      SELECT * FROM nameserver_history
      WHERE domain_id = ?
      ORDER BY id DESC
      LIMIT 1
      `,
      [domainId],
      (err, row) => {
        if (err) reject(err);
        else resolve(row);
      }
    );
  });
}

function saveHistory(domainId, nameservers, changed) {
  return new Promise((resolve, reject) => {
    db.run(
      `
      INSERT INTO nameserver_history (domain_id, nameservers, changed)
      VALUES (?, ?, ?)
      `,
      [domainId, JSON.stringify(nameservers), changed ? 1 : 0],
      function (err) {
        if (err) reject(err);
        else resolve(this.lastID);
      }
    );
  });
}

function createAlert(domainId, message, oldValue, newValue) {
  return new Promise((resolve, reject) => {
    db.run(
      `
      INSERT INTO alerts (domain_id, alert_type, message, old_value, new_value)
      VALUES (?, ?, ?, ?, ?)
      `,
      [
        domainId,
        "NS_CHANGED",
        message,
        JSON.stringify(oldValue),
        JSON.stringify(newValue)
      ],
      function (err) {
        if (err) reject(err);
        else resolve(this.lastID);
      }
    );
  });
}

function getAllDomains() {
  return new Promise((resolve, reject) => {
    db.all(`SELECT * FROM domains`, [], (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

async function checkAndStoreDomain(domain) {
  const currentNameservers = await getNameservers(domain.domain);
  const latestHistory = await getLatestHistory(domain.id);

  let changed = true;
  let oldNameservers = [];

  if (latestHistory) {
    oldNameservers = JSON.parse(latestHistory.nameservers);

    changed =
      JSON.stringify(oldNameservers) !== JSON.stringify(currentNameservers);
  }

  if (changed) {
    await saveHistory(domain.id, currentNameservers, true);

    await createAlert(
      domain.id,
      `${domain.domain} nameservers changed`,
      oldNameservers,
      currentNameservers
    );
  }

  return {
    domain: domain.domain,
    changed,
    oldNameservers,
    currentNameservers
  };
}

app.get("/", (req, res) => {
  res.json({
    message: "DomainPulse backend is running"
  });
});

app.post("/api/domains", async (req, res) => {
  try {
    const { domain } = req.body;

    if (!domain) {
      return res.status(400).json({
        error: "Domain is required"
      });
    }

    const cleanDomain = domain.toLowerCase().trim();
    const nameservers = await getNameservers(cleanDomain);

    db.run(
      `INSERT INTO domains (domain) VALUES (?)`,
      [cleanDomain],
      async function (err) {
        if (err) {
          return res.status(400).json({
            error: "Domain already exists or could not be saved"
          });
        }

        const domainId = this.lastID;

        await saveHistory(domainId, nameservers, true);

        res.json({
          message: "Domain added successfully",
          id: domainId,
          domain: cleanDomain,
          nameservers
        });
      }
    );
  } catch (error) {
    res.status(500).json({
      error: "Could not fetch nameservers",
      details: error.message
    });
  }
});

app.get("/api/domains", (req, res) => {
  db.all(`SELECT * FROM domains ORDER BY id DESC`, [], (err, rows) => {
    if (err) {
      return res.status(500).json({
        error: err.message
      });
    }

    res.json(rows);
  });
});

app.get("/api/domains/:id/history", (req, res) => {
  db.all(
    `
    SELECT * FROM nameserver_history
    WHERE domain_id = ?
    ORDER BY id DESC
    `,
    [req.params.id],
    (err, rows) => {
      if (err) {
        return res.status(500).json({
          error: err.message
        });
      }

      const formattedRows = rows.map((row) => ({
        ...row,
        nameservers: JSON.parse(row.nameservers),
        changed: Boolean(row.changed)
      }));

      res.json(formattedRows);
    }
  );
});

app.post("/api/domains/:id/check", async (req, res) => {
  try {
    const domain = await getDomainById(req.params.id);

    if (!domain) {
      return res.status(404).json({
        error: "Domain not found"
      });
    }

    const result = await checkAndStoreDomain(domain);

    res.json({
      message: result.changed
        ? "Nameservers changed. New history and alert saved."
        : "No nameserver change detected.",
      ...result
    });
  } catch (error) {
    res.status(500).json({
      error: "Could not check domain",
      details: error.message
    });
  }
});

app.get("/api/alerts", (req, res) => {
  db.all(
    `
    SELECT alerts.*, domains.domain
    FROM alerts
    JOIN domains ON alerts.domain_id = domains.id
    ORDER BY alerts.id DESC
    `,
    [],
    (err, rows) => {
      if (err) {
        return res.status(500).json({
          error: err.message
        });
      }

      const formattedRows = rows.map((row) => ({
        ...row,
        old_value: row.old_value ? JSON.parse(row.old_value) : [],
        new_value: row.new_value ? JSON.parse(row.new_value) : [],
        is_read: Boolean(row.is_read)
      }));

      res.json(formattedRows);
    }
  );
});

app.delete("/api/domains/:id", (req, res) => {
  const domainId = req.params.id;

  db.serialize(() => {
    db.run(`DELETE FROM nameserver_history WHERE domain_id = ?`, [domainId]);
    db.run(`DELETE FROM alerts WHERE domain_id = ?`, [domainId]);
    db.run(`DELETE FROM domains WHERE id = ?`, [domainId], function (err) {
      if (err) {
        return res.status(500).json({
          error: err.message
        });
      }

      res.json({
        message: "Domain deleted successfully"
      });
    });
  });
});

// Auto-check every 1 minute for testing.
// Later change "*/1 * * * *" to "0 9 * * *" for daily 9 AM.
cron.schedule("*/1 * * * *", async () => {
  console.log("Running automatic domain check...");

  try {
    const domains = await getAllDomains();

    for (const domain of domains) {
      try {
        const result = await checkAndStoreDomain(domain);

        console.log(
          `${result.domain}: ${
            result.changed ? "Nameserver changed" : "No change"
          }`
        );
      } catch (error) {
        console.log(`Failed to check ${domain.domain}: ${error.message}`);
      }
    }
  } catch (error) {
    console.log("Automatic check failed:", error.message);
  }
});

app.listen(PORT, () => {
  console.log(`Backend running on http://localhost:${PORT}`);
});