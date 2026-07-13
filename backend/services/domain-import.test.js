import test from "node:test";
import assert from "node:assert/strict";
import {
  createDomainImportService,
  DomainImportError,
  MAX_BULK_DOMAINS,
  normalizeDomain,
} from "./domain-import.js";

test("normalizeDomain accepts URLs and modern TLDs", () => {
  assert.equal(normalizeDomain("https://www.Example.AI/path"), "example.ai");
  assert.equal(normalizeDomain("portfolio.xyz"), "portfolio.xyz");
});

test("bulk import adds unique domains, creates baselines, and sends one email", async () => {
  const insertedDomains = [];
  const baselineChecks = [];
  const summaryEmails = [];
  const pool = {
    async query(sql, values) {
      if (sql.startsWith("SELECT domain")) {
        return { rows: [{ domain: "taken.org" }] };
      }

      const rows = values[0].map((domain, index) => ({
        id: index + 10,
        domain,
        nameservers: [],
        user_id: values[1],
      }));
      insertedDomains.push(...rows.map((row) => row.domain));
      return { rows };
    },
  };
  const service = createDomainImportService({
    pool,
    monitoringService: {
      async checkDomain(input) {
        baselineChecks.push(input);
      },
    },
    emailService: {
      async sendBulkImportSummary(input) {
        summaryEmails.push(input);
        return { status: "sent", providerId: "email_bulk_123" };
      },
    },
  });

  const result = await service.importDomains({
    entries: [
      "https://www.Example.com/path",
      "example.com",
      "taken.org",
      "portfolio.xyz",
      "startup.io",
      "product.ai",
      "not a domain",
    ],
    user: { id: 7, email: "avijit@example.com", name: "Avijit" },
  });

  assert.deepEqual(insertedDomains, [
    "example.com",
    "portfolio.xyz",
    "startup.io",
    "product.ai",
  ]);
  assert.equal(baselineChecks.length, 4);
  assert.deepEqual(result.duplicates.sort(), ["example.com", "taken.org"]);
  assert.deepEqual(result.invalid, ["not a domain"]);
  assert.deepEqual(result.baseline, { checked: 4, failed: 0 });
  assert.equal(result.email_status, "sent");
  assert.equal(summaryEmails.length, 1);
  assert.equal(summaryEmails[0].addedDomains.length, 4);
});

test("bulk import rejects more than the maximum number of entries", async () => {
  const service = createDomainImportService({
    pool: {},
    monitoringService: {},
    emailService: {},
  });

  await assert.rejects(
    service.importDomains({
      entries: Array.from(
        { length: MAX_BULK_DOMAINS + 1 },
        (_, index) => `domain${index}.com`
      ),
      user: { id: 7 },
    }),
    (error) =>
      error instanceof DomainImportError && error.statusCode === 400
  );
});

test("bulk import rejects additions above the active plan limit", async () => {
  const service = createDomainImportService({
    pool: {
      async query(sql) {
        if (sql.startsWith("SELECT domain")) return { rows: [] };
        if (sql.startsWith("SELECT COUNT")) {
          return { rows: [{ domain_count: 4 }] };
        }
        throw new Error("Insert should not run above the plan limit");
      },
    },
    monitoringService: {},
    emailService: {},
  });

  await assert.rejects(
    service.importDomains({
      entries: ["fifth.com", "sixth.com"],
      user: { id: 7 },
      domainLimit: 5,
    }),
    (error) =>
      error instanceof DomainImportError &&
      error.code === "domain_limit_reached" &&
      error.statusCode === 403
  );
});
