import dns from "dns/promises";

export class MonitoringError extends Error {
  constructor(message, statusCode = 500) {
    super(message);
    this.name = "MonitoringError";
    this.statusCode = statusCode;
  }
}

function normalizeNameservers(nameservers) {
  return [...new Set(nameservers.map((value) => value.toLowerCase()))].sort();
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

export function createMonitoringService({ pool, emailService }) {
  async function findDomain({ domainId, domain, userId }) {
    const conditions = [];
    const values = [];

    if (domainId) {
      values.push(domainId);
      conditions.push(`d.id = $${values.length}`);
    }

    if (domain) {
      values.push(domain);
      conditions.push(`d.domain = $${values.length}`);
    }

    if (userId) {
      values.push(userId);
      conditions.push(`d.user_id = $${values.length}`);
    }

    const result = await pool.query(
      `
        SELECT
          d.id,
          d.domain,
          d.nameservers,
          d.user_id,
          u.email,
          u.name,
          COALESCE(u.email_alerts_enabled, TRUE) AS email_alerts_enabled
        FROM domains d
        JOIN users u ON u.id = d.user_id
        WHERE ${conditions.join(" AND ")}
        LIMIT 1
      `,
      values
    );

    return result.rows[0] || null;
  }

  async function recordEmailResult(alertId, result) {
    await pool.query(
      `
        UPDATE domain_alerts
        SET
          email_status = $1,
          email_provider_id = $2,
          email_error = $3,
          email_sent_at = CASE WHEN $1 = 'sent' THEN NOW() ELSE email_sent_at END
        WHERE id = $4
      `,
      [result.status, result.providerId || null, result.error || null, alertId]
    );
  }

  async function checkDomain({ domainId, domain, userId, source = "manual" }) {
    const domainRecord = await findDomain({ domainId, domain, userId });

    if (!domainRecord) {
      throw new MonitoringError("Domain not found in your account", 404);
    }

    let resolvedNameservers;

    try {
      resolvedNameservers = normalizeNameservers(await dns.resolveNs(domainRecord.domain));
    } catch (error) {
      console.error(
        `DNS lookup failed for ${domainRecord.domain}:`,
        error.code || error.message
      );
      throw new MonitoringError(
        `Nameservers could not be resolved for ${domainRecord.domain}. Check the spelling and DNS configuration.`,
        422
      );
    }

    const client = await pool.connect();
    let alertId = null;
    let previousNameservers = [];
    let changed = false;
    let checkedAt;

    try {
      await client.query("BEGIN");
      const lockedResult = await client.query(
        "SELECT nameservers FROM domains WHERE id = $1 FOR UPDATE",
        [domainRecord.id]
      );

      if (!lockedResult.rows[0]) {
        throw new MonitoringError("Domain no longer exists", 404);
      }

      previousNameservers = normalizeNameservers(
        lockedResult.rows[0].nameservers || []
      );
      changed =
        previousNameservers.length > 0 &&
        JSON.stringify(previousNameservers) !== JSON.stringify(resolvedNameservers);

      const updateResult = await client.query(
        `
          UPDATE domains
          SET nameservers = $1, checked_at = NOW()
          WHERE id = $2
          RETURNING checked_at
        `,
        [resolvedNameservers, domainRecord.id]
      );
      checkedAt = updateResult.rows[0].checked_at;

      if (previousNameservers.length === 0 || changed) {
        await client.query(
          `
            INSERT INTO domain_monitoring_history (
              user_id,
              domain_id,
              event_type,
              previous_nameservers,
              current_nameservers,
              source,
              checked_at
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7)
          `,
          [
            domainRecord.user_id,
            domainRecord.id,
            previousNameservers.length === 0 ? "baseline" : "change",
            previousNameservers,
            resolvedNameservers,
            source,
            checkedAt,
          ]
        );
      }

      if (changed) {
        const alertResult = await client.query(
          `
            INSERT INTO domain_alerts (
              user_id,
              domain_id,
              alert_type,
              previous_nameservers,
              current_nameservers,
              email_status
            )
            VALUES ($1, $2, 'nameserver_change', $3, $4, 'pending')
            RETURNING id
          `,
          [
            domainRecord.user_id,
            domainRecord.id,
            previousNameservers,
            resolvedNameservers,
          ]
        );
        alertId = alertResult.rows[0].id;
      }

      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }

    let emailStatus = null;

    if (changed && alertId) {
      if (!domainRecord.email_alerts_enabled) {
        emailStatus = "disabled";
        await recordEmailResult(alertId, {
          status: "disabled",
          error: "Email alerts are disabled for this user",
        });
      } else {
        try {
          const emailResult = await emailService.sendNameserverChange({
            to: domainRecord.email,
            name: domainRecord.name,
            domain: domainRecord.domain,
            previousNameservers,
            currentNameservers: resolvedNameservers,
          });
          emailStatus = emailResult.status;
          await recordEmailResult(alertId, emailResult);
        } catch (error) {
          emailStatus = "failed";
          console.error(`Alert email failed for ${domainRecord.domain}:`, error);
          await recordEmailResult(alertId, {
            status: "failed",
            error: error.message,
          });
        }
      }
    }

    return {
      domain: domainRecord.domain,
      nameservers: resolvedNameservers,
      previous_nameservers: previousNameservers,
      changed,
      checked_at: checkedAt,
      email_status: emailStatus,
    };
  }

  async function runScheduledChecks() {
    const result = await pool.query(
      "SELECT id, domain FROM domains WHERE user_id IS NOT NULL ORDER BY id"
    );
    const outcomes = new Array(result.rows.length);

    await runWithConcurrency(result.rows, 5, async (item, index) => {
      try {
        const checkResult = await checkDomain({
          domainId: item.id,
          source: "scheduled",
        });
        outcomes[index] = {
          domain: item.domain,
          ok: true,
          changed: checkResult.changed,
          email_status: checkResult.email_status,
        };
      } catch (error) {
        outcomes[index] = {
          domain: item.domain,
          ok: false,
          error: error.message,
        };
      }
    });

    return {
      checked: outcomes.filter((item) => item.ok).length,
      changed: outcomes.filter((item) => item.changed).length,
      failed: outcomes.filter((item) => !item.ok).length,
      outcomes,
    };
  }

  return { checkDomain, runScheduledChecks };
}
