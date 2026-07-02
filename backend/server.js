const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const dns = require("node:dns").promises;

const app = express();
const PORT = process.env.PORT || 5001;

app.use(cors());
app.use(express.json());

const dataDir = path.join(__dirname, "data");
const domainsFile = path.join(dataDir, "domains.json");
const alertsFile = path.join(dataDir, "alerts.json");

function ensureFiles() {
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir);
  }

  if (!fs.existsSync(domainsFile)) {
    fs.writeFileSync(domainsFile, "[]");
  }

  if (!fs.existsSync(alertsFile)) {
    fs.writeFileSync(alertsFile, "[]");
  }
}

function readJson(file) {
  ensureFiles();
  return JSON.parse(fs.readFileSync(file, "utf-8"));
}

function writeJson(file, data) {
  ensureFiles();
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

function cleanDomain(input) {
  return input
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .split("/")[0];
}

function normalizeNameservers(nameservers) {
  return nameservers
    .map((ns) => ns.toLowerCase().replace(/\.$/, ""))
    .sort();
}

function areSameNameservers(oldNs, newNs) {
  return JSON.stringify(oldNs) === JSON.stringify(newNs);
}

async function getNameservers(domain) {
  const ns = await dns.resolveNs(domain);
  return normalizeNameservers(ns);
}

app.get("/", (req, res) => {
  res.json({
    message: "DomainPulse backend running",
  });
});

app.get("/api/domains", (req, res) => {
  const domains = readJson(domainsFile);
  res.json(domains);
});

app.post("/api/domains", async (req, res) => {
  try {
    const domain = cleanDomain(req.body.domain || "");

    if (!domain) {
      return res.status(400).json({ error: "Domain is required" });
    }

    const domains = readJson(domainsFile);

    const existingDomain = domains.find((item) => item.domain === domain);

    if (existingDomain) {
      return res.status(409).json({
        error: "Domain already exists",
        domain: existingDomain,
      });
    }

    const nameservers = await getNameservers(domain);

    const newDomain = {
      id: Date.now(),
      domain,
      nameservers,
      createdAt: new Date().toISOString(),
      lastCheckedAt: new Date().toISOString(),
    };

    domains.push(newDomain);
    writeJson(domainsFile, domains);

    res.status(201).json({
      message: "Domain added successfully",
      domain: newDomain,
    });
  } catch (error) {
    res.status(500).json({
      error: "Could not fetch nameservers",
      details: error.message,
    });
  }
});

app.post("/api/check/:domain", async (req, res) => {
  try {
    const domainName = cleanDomain(req.params.domain);

    const domains = readJson(domainsFile);
    const alerts = readJson(alertsFile);

    const domain = domains.find((item) => item.domain === domainName);

    if (!domain) {
      return res.status(404).json({ error: "Domain not found" });
    }

    const oldNameservers = domain.nameservers || [];
    const newNameservers = await getNameservers(domainName);

    domain.lastCheckedAt = new Date().toISOString();

    if (!areSameNameservers(oldNameservers, newNameservers)) {
      const alert = {
        id: Date.now(),
        domain: domainName,
        type: "NS_CHANGE",
        message: `Nameserver changed for ${domainName}`,
        oldNameservers,
        newNameservers,
        createdAt: new Date().toISOString(),
      };

      alerts.unshift(alert);
      domain.nameservers = newNameservers;

      writeJson(alertsFile, alerts);
      writeJson(domainsFile, domains);

      return res.json({
        changed: true,
        message: "Nameserver change detected",
        alert,
      });
    }

    writeJson(domainsFile, domains);

    res.json({
      changed: false,
      message: "No nameserver change detected",
      domain,
    });
  } catch (error) {
    res.status(500).json({
      error: "Check failed",
      details: error.message,
    });
  }
});

app.post("/api/check-all", async (req, res) => {
  const domains = readJson(domainsFile);
  const alerts = readJson(alertsFile);

  const results = [];

  for (const domain of domains) {
    try {
      const oldNameservers = domain.nameservers || [];
      const newNameservers = await getNameservers(domain.domain);

      domain.lastCheckedAt = new Date().toISOString();

      if (!areSameNameservers(oldNameservers, newNameservers)) {
        const alert = {
          id: Date.now() + Math.floor(Math.random() * 1000),
          domain: domain.domain,
          type: "NS_CHANGE",
          message: `Nameserver changed for ${domain.domain}`,
          oldNameservers,
          newNameservers,
          createdAt: new Date().toISOString(),
        };

        alerts.unshift(alert);
        domain.nameservers = newNameservers;

        results.push({
          domain: domain.domain,
          changed: true,
          alert,
        });
      } else {
        results.push({
          domain: domain.domain,
          changed: false,
        });
      }
    } catch (error) {
      results.push({
        domain: domain.domain,
        changed: false,
        error: error.message,
      });
    }
  }

  writeJson(domainsFile, domains);
  writeJson(alertsFile, alerts);

  res.json({
    message: "All domains checked",
    results,
  });
});

app.get("/api/alerts", (req, res) => {
  const alerts = readJson(alertsFile);
  res.json(alerts);
});

app.delete("/api/domains/:domain", (req, res) => {
  const domainName = cleanDomain(req.params.domain);

  const domains = readJson(domainsFile);
  const updatedDomains = domains.filter((item) => item.domain !== domainName);

  writeJson(domainsFile, updatedDomains);

  res.json({
    message: "Domain deleted",
    domain: domainName,
  });
});

app.listen(PORT, () => {
  console.log(`Backend running on port ${PORT}`);
});