import test from "node:test";
import assert from "node:assert/strict";
import { createEmailService } from "./email.js";

test("sendDomainAdded sends a confirmation to the signed-in user", async () => {
  const sentMessages = [];
  const service = createEmailService({
    from: "DomainPulse <alerts@domainpulsehq.com>",
    frontendUrl: "https://domainpulsehq.com/",
    resendClient: {
      emails: {
        async send(message) {
          sentMessages.push(message);
          return { data: { id: "email_123" }, error: null };
        },
      },
    },
  });

  const result = await service.sendDomainAdded({
    to: "avijit@example.com",
    name: "Avijit",
    domain: "example.com",
  });

  assert.deepEqual(result, { status: "sent", providerId: "email_123" });
  assert.equal(sentMessages.length, 1);
  assert.deepEqual(sentMessages[0].to, ["avijit@example.com"]);
  assert.equal(sentMessages[0].subject, "Monitoring started for example.com");
  assert.match(sentMessages[0].text, /Hi Avijit,/);
  assert.match(sentMessages[0].text, /https:\/\/domainpulsehq\.com/);
});

test("sendDomainAdded is skipped when email delivery is not configured", async () => {
  const service = createEmailService({ apiKey: "", from: "" });

  const result = await service.sendDomainAdded({
    to: "avijit@example.com",
    name: "Avijit",
    domain: "example.com",
  });

  assert.equal(result.status, "skipped");
});

test("sendNameserverChange keeps the existing alert recipient format", async () => {
  let sentMessage;
  const service = createEmailService({
    from: "DomainPulse <alerts@domainpulsehq.com>",
    resendClient: {
      emails: {
        async send(message) {
          sentMessage = message;
          return { data: { id: "email_456" }, error: null };
        },
      },
    },
  });

  await service.sendNameserverChange({
    to: "avijit@example.com",
    name: "Avijit",
    domain: "example.com",
    previousNameservers: ["ns1.old.example"],
    currentNameservers: ["ns1.new.example"],
  });

  assert.deepEqual(sentMessage.to, ["avijit@example.com"]);
  assert.equal(
    sentMessage.subject,
    "Nameserver change detected for example.com"
  );
});

test("sendBulkImportSummary sends one report for the whole import", async () => {
  let sentMessage;
  const service = createEmailService({
    from: "DomainPulse <alerts@domainpulsehq.com>",
    frontendUrl: "https://domainpulsehq.com",
    resendClient: {
      emails: {
        async send(message) {
          sentMessage = message;
          return { data: { id: "email_bulk_123" }, error: null };
        },
      },
    },
  });

  await service.sendBulkImportSummary({
    to: "avijit@example.com",
    name: "Avijit",
    addedDomains: ["one.org", "two.ai"],
    duplicateDomains: ["existing.com"],
    invalidEntries: ["not a domain"],
    baseline: { checked: 2, failed: 0 },
  });

  assert.deepEqual(sentMessage.to, ["avijit@example.com"]);
  assert.equal(sentMessage.subject, "2 domains added to DomainPulse");
  assert.match(sentMessage.text, /• one\.org/);
  assert.match(sentMessage.text, /• two\.ai/);
});
