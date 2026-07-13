const DOMAIN_PATTERN = /^(?!-)(?:[a-z0-9-]{1,63}\.)+[a-z]{2,}$/i;

export const MAX_BULK_DOMAINS = 100;

export class DomainImportError extends Error {
  constructor(message, statusCode = 400, code = "domain_import_error") {
    super(message);
    this.name = "DomainImportError";
    this.statusCode = statusCode;
    this.code = code;
  }
}

export function normalizeDomain(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .split("/")[0]
    .split("?")[0]
    .split("#")[0];
}

function unique(values) {
  return [...new Set(values)];
}

async function runWithConcurrency(items, concurrency, worker) {
  let nextIndex = 0;

  async function runWorker() {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      await worker(items[index], index);
    }
  }

  const workerCount = Math.min(concurrency, items.length);
  await Promise.all(Array.from({ length: workerCount }, () => runWorker()));
}

export function createDomainImportService({
  pool,
  monitoringService,
  emailService,
}) {
  async function importDomains({ entries, user, domainLimit = Infinity }) {
    if (!Array.isArray(entries) || entries.length === 0) {
      throw new DomainImportError("Add at least one domain");
    }

    if (entries.length > MAX_BULK_DOMAINS) {
      throw new DomainImportError(
        `You can import up to ${MAX_BULK_DOMAINS} domains at a time`
      );
    }

    const validDomains = [];
    const invalidEntries = [];
    const repeatedDomains = [];
    const seen = new Set();

    for (const entry of entries) {
      const domain = normalizeDomain(entry);

      if (!DOMAIN_PATTERN.test(domain)) {
        invalidEntries.push(String(entry || "").trim() || "(blank)");
        continue;
      }

      if (seen.has(domain)) {
        repeatedDomains.push(domain);
        continue;
      }

      seen.add(domain);
      validDomains.push(domain);
    }

    if (validDomains.length === 0) {
      return {
        added: [],
        duplicates: unique(repeatedDomains),
        invalid: unique(invalidEntries),
        baseline: { checked: 0, failed: 0 },
        email_status: "skipped",
      };
    }

    const existingResult = await pool.query(
      "SELECT domain FROM domains WHERE user_id = $1 AND domain = ANY($2::TEXT[])",
      [user.id, validDomains]
    );
    const existingDomains = new Set(
      existingResult.rows.map((row) => row.domain)
    );
    const candidates = validDomains.filter(
      (domain) => !existingDomains.has(domain)
    );

    if (Number.isFinite(domainLimit) && candidates.length > 0) {
      const usageResult = await pool.query(
        "SELECT COUNT(*)::INTEGER AS domain_count FROM domains WHERE user_id = $1",
        [user.id]
      );
      const currentCount = Number(usageResult.rows[0]?.domain_count || 0);

      if (currentCount + candidates.length > domainLimit) {
        throw new DomainImportError(
          `This import would exceed your ${domainLimit}-domain plan limit`,
          403,
          "domain_limit_reached"
        );
      }
    }

    let added = [];

    if (candidates.length > 0) {
      const insertResult = await pool.query(
        `
          INSERT INTO domains (domain, nameservers, user_id)
          SELECT input.domain, ARRAY[]::TEXT[], $2
          FROM UNNEST($1::TEXT[]) AS input(domain)
          ON CONFLICT (user_id, domain) DO NOTHING
          RETURNING *
        `,
        [candidates, user.id]
      );
      added = insertResult.rows;
    }

    const addedNames = new Set(added.map((row) => row.domain));
    const racedDuplicates = candidates.filter(
      (domain) => !addedNames.has(domain)
    );
    const duplicates = unique([
      ...repeatedDomains,
      ...existingDomains,
      ...racedDuplicates,
    ]);
    const baselineOutcomes = new Array(added.length);

    await runWithConcurrency(added, 5, async (domainRecord, index) => {
      try {
        await monitoringService.checkDomain({
          domainId: domainRecord.id,
          userId: user.id,
          source: "manual",
        });
        baselineOutcomes[index] = { domain: domainRecord.domain, ok: true };
      } catch (error) {
        baselineOutcomes[index] = {
          domain: domainRecord.domain,
          ok: false,
          error: error.message,
        };
      }
    });

    const baseline = {
      checked: baselineOutcomes.filter((outcome) => outcome.ok).length,
      failed: baselineOutcomes.filter((outcome) => !outcome.ok).length,
    };
    let emailStatus = "skipped";

    if (added.length > 0) {
      try {
        const emailResult = await emailService.sendBulkImportSummary({
          to: user.email,
          name: user.name,
          addedDomains: added.map((row) => row.domain),
          duplicateDomains: duplicates,
          invalidEntries: unique(invalidEntries),
          baseline,
        });
        emailStatus = emailResult.status;
      } catch (error) {
        emailStatus = "failed";
        console.error("Bulk import summary email failed:", error);
      }
    }

    return {
      added,
      duplicates,
      invalid: unique(invalidEntries),
      baseline,
      email_status: emailStatus,
    };
  }

  return { importDomains };
}
