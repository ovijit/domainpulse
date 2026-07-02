const express = require("express");
const cors = require("cors");
const dns = require("dns").promises;
const fs = require("fs");
const path = require("path");

const app = express();

const PORT = process.env.PORT || 5001;
const HOST = "0.0.0.0";

const DATA_FILE = path.join(__dirname, "data.json");

app.use(
  cors({
    origin: ["http://localhost:5173", process.env.FRONTEND_URL].filter(Boolean),
  })
);

app.use(express.json());

function createDefaultData() {
  return {
    domains: [],
    history: [],
    alerts: [],
  };
}

function readData() {
  try {
    if (!fs.existsSync(DATA_FILE)) {
      fs.writeFileSync(DATA_FILE, JSON.stringify(createDefaultData(), null, 2));
    }

    const rawData = fs.readFileSync(DATA_FILE, "utf-8");
    return JSON.parse(rawData);
  } catch (error) {
    return createDefaultData();
  }
}

function writeData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

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

function getTimeAgo(dateString) {
  const created = new Date(dateString);
  const now = new Date();
  const diffMs = now - created;
  const diffMinutes = Math.floor(diffMs / 60000);

  if (diffMinutes < 1) return "Now";
  if (diffMinutes < 60) return `${diffMinutes} min ago`;

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours} hr ago`;

  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays} day ago`;
}

app.get("/", (req, res) => {
  res.json({
    message: "DomainPulse backend is running",
    storage: "JSON file",
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

app.get("/api/domains", (req, res) => {
  const data = readData();

  const domains = data.domains
    .slice()
    .sort((a, b) => b.id - a.id);

  res.json(domains);
});

app.post("/api/domains", async (req, res) => {
  const { domain } = req.body;

  if (!domain) {
    return res.status(400).json({ error: "Domain is required" });
  }

  const cleanedDomain = cleanDomain(domain);
  const data = readData();

  const exists = data.domains.find((item) => item.domain === cleanedDomain);

  if (exists) {
    return res.status(400).json({ error: "Domain already exists" });
  }

  const nameservers = await getNameservers(cleanedDomain);

  const newDomain = {
    id: Date.now(),
    domain: cleanedDomain,
    created_at: new Date().toISOString(),
  };

  data.domains.push(newDomain);

  data.history.push({
    id: Date.now() + 1,
    domain_id: newDomain.id,
    domain: cleanedDomain,
    nameservers,
    checked_at: new Date().toISOString(),
  });

  writeData(data);

  res.json({
    message: "Domain added successfully",
    id: newDomain.id,
    domain: cleanedDomain,
    nameservers,
  });
});

app.delete("/api/domains/:id", (req, res) => {
  const id = Number(req.params.id);
  const data = readData();

  data.domains = data.domains.filter((domain) => domain.id !== id);
  data.history = data.history.filter((item) => item.domain_id !== id);

  writeData(data);

  res.json({ message: "Domain deleted successfully" });
});

app.post("/api/domains/:id/check", async (req, res) => {
  const id = Number(req.params.id);
  const data = readData();

  const domainRow = data.domains.find((item) => item.id === id);

  if (!domainRow) {
    return res.status(404).json({ error: "Domain not found" });
  }

  const newNameservers = await getNameservers(domainRow.domain);

  const domainHistory = data.history
    .filter((item) => item.domain_id === id)
    .sort((a, b) => new Date(b.checked_at) - new Date(a.checked_at));

  const lastHistory = domainHistory[0];

  const oldNameservers = lastHistory ? lastHistory.nameservers : [];

  const oldText = JSON.stringify(oldNameservers);
  const newText = JSON.stringify(newNameservers);

  data.history.push({
    id: Date.now(),
    domain_id: id,
    domain: domainRow.domain,
    nameservers: newNameservers,
    checked_at: new Date().toISOString(),
  });

  const changed = oldText !== newText;

  if (changed) {
    data.alerts.push({
      id: Date.now() + 1,
      domain: domainRow.domain,
      old_nameservers: oldNameservers,
      new_nameservers: newNameservers,
      message: "Nameserver changed",
      created_at: new Date().toISOString(),
    });
  }

  writeData(data);

  res.json({
    message: changed ? "Nameserver changed" : "No nameserver change",
    domain: domainRow.domain,
    oldNameservers,
    newNameservers,
    changed,
  });
});

app.post("/api/check-all", async (req, res) => {
  const data = readData();
  const results = [];

  for (const domainRow of data.domains) {
    const newNameservers = await getNameservers(domainRow.domain);

    const domainHistory = data.history
      .filter((item) => item.domain_id === domainRow.id)
      .sort((a, b) => new Date(b.checked_at) - new Date(a.checked_at));

    const lastHistory = domainHistory[0];

    const oldNameservers = lastHistory ? lastHistory.nameservers : [];

    const oldText = JSON.stringify(oldNameservers);
    const newText = JSON.stringify(newNameservers);

    data.history.push({
      id: Date.now() + Math.floor(Math.random() * 10000),
      domain_id: domainRow.id,
      domain: domainRow.domain,
      nameservers: newNameservers,
      checked_at: new Date().toISOString(),
    });

    const changed = oldText !== newText;

    if (changed) {
      data.alerts.push({
        id: Date.now() + Math.floor(Math.random() * 10000),
        domain: domainRow.domain,
        old_nameservers: oldNameservers,
        new_nameservers: newNameservers,
        message: "Nameserver changed",
        created_at: new Date().toISOString(),
      });
    }

    results.push({
      domain: domainRow.domain,
      changed,
      oldNameservers,
      newNameservers,
    });
  }

  writeData(data);

  res.json({
    message: "All domains checked",
    results,
  });
});

app.get("/api/alerts", (req, res) => {
  const data = readData();

  const alerts = data.alerts
    .slice()
    .sort((a, b) => b.id - a.id)
    .map((alert) => ({
      ...alert,
      time: getTimeAgo(alert.created_at),
    }));

  res.json(alerts);
});

app.delete("/api/alerts", (req, res) => {
  const data = readData();

  data.alerts = [];

  writeData(data);

  res.json({ message: "Alerts cleared successfully" });
});

app.get("/api/stats", (req, res) => {
  const data = readData();

  res.json({
    totalDomains: data.domains.length,
    totalAlerts: data.alerts.length,
  });
});

app.get("/api/domains/:id/history", (req, res) => {
  const id = Number(req.params.id);
  const data = readData();

  const history = data.history
    .filter((item) => item.domain_id === id)
    .sort((a, b) => new Date(b.checked_at) - new Date(a.checked_at));

  res.json(history);
});

app.listen(PORT, HOST, () => {
  console.log(`Backend running on port ${PORT}`);
});