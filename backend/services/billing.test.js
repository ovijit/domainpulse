import test from "node:test";
import assert from "node:assert/strict";
import crypto from "crypto";
import {
  BillingError,
  createBillingService,
  PLAN_CATALOG,
} from "./billing.js";

function summaryRow(overrides = {}) {
  return {
    plan_key: null,
    razorpay_subscription_id: null,
    status: null,
    current_start: null,
    current_end: null,
    cancel_at_cycle_end: false,
    domain_count: 2,
    ...overrides,
  };
}

test("free accounts receive the free entitlement", async () => {
  const service = createBillingService({
    pool: { query: async () => ({ rows: [summaryRow()] }) },
    enforcementEnabled: true,
    planIds: {},
  });

  const result = await service.getSummary(7);
  assert.equal(result.plan.key, "free");
  assert.equal(result.usage.domain_limit, 5);
  assert.equal(result.usage.remaining_domains, 3);
});

test("domain limits are enforced only after billing enforcement is enabled", async () => {
  const pool = {
    query: async () => ({ rows: [summaryRow({ domain_count: 5 })] }),
  };
  const enforced = createBillingService({
    pool,
    enforcementEnabled: true,
    planIds: {},
  });
  const preview = createBillingService({
    pool,
    enforcementEnabled: false,
    planIds: {},
  });

  await assert.rejects(
    enforced.assertCapacity(7, 1),
    (error) =>
      error instanceof BillingError && error.code === "domain_limit_reached"
  );
  await assert.doesNotReject(preview.assertCapacity(7, 1));
});

test("checkout signatures are verified before activating an entitlement", async () => {
  const keySecret = "test_secret";
  const paymentId = "pay_123";
  const subscriptionId = "sub_123";
  const signature = crypto
    .createHmac("sha256", keySecret)
    .update(`${paymentId}|${subscriptionId}`)
    .digest("hex");
  const queries = [];
  const service = createBillingService({
    pool: {
      async query(sql) {
        queries.push(sql);
        if (sql.includes("FROM users u")) {
          return {
            rows: [
              summaryRow({
                plan_key: "pro",
                razorpay_subscription_id: subscriptionId,
                status: "active",
              }),
            ],
          };
        }
        return { rows: [] };
      },
    },
    keyId: "key_test_123",
    keySecret,
    planIds: { pro: "plan_pro" },
    razorpayClient: {
      subscriptions: {
        async fetch() {
          return {
            id: subscriptionId,
            plan_id: "plan_pro",
            status: "active",
            notes: { user_id: "7", plan_key: "pro" },
          };
        },
      },
    },
  });

  const result = await service.verifyCheckout({
    userId: 7,
    paymentId,
    subscriptionId,
    signature,
  });

  assert.equal(result.plan, PLAN_CATALOG.pro);
  assert.ok(queries.some((sql) => sql.includes("INSERT INTO user_subscriptions")));
});

test("an unfinished checkout reuses its existing Razorpay subscription", async () => {
  let createCalls = 0;
  const service = createBillingService({
    pool: {
      async query(sql) {
        if (sql.includes("FROM users u")) {
          return {
            rows: [
              summaryRow({
                plan_key: "starter",
                razorpay_subscription_id: "sub_existing",
                status: "created",
              }),
            ],
          };
        }
        return { rows: [] };
      },
    },
    keyId: "key_test_123",
    keySecret: "test_secret",
    planIds: { starter: "plan_starter" },
    razorpayClient: {
      subscriptions: {
        async create() {
          createCalls += 1;
        },
      },
    },
  });

  const result = await service.createSubscription({
    user: { id: 7, name: "Avijit", email: "avijit@example.com" },
    planKey: "starter",
  });

  assert.equal(result.subscription_id, "sub_existing");
  assert.equal(createCalls, 0);
});

test("webhooks require a signature calculated from the raw request body", async () => {
  const webhookSecret = "webhook_secret";
  const rawBody = Buffer.from(
    JSON.stringify({
      event: "subscription.activated",
      payload: {
        subscription: {
          entity: {
            id: "sub_456",
            plan_id: "plan_portfolio",
            status: "active",
            notes: { user_id: "9", plan_key: "portfolio" },
          },
        },
      },
    })
  );
  const signature = crypto
    .createHmac("sha256", webhookSecret)
    .update(rawBody)
    .digest("hex");
  let updated = false;
  const service = createBillingService({
    pool: {
      async query(sql) {
        if (sql.includes("INSERT INTO user_subscriptions")) updated = true;
        return { rows: [] };
      },
    },
    webhookSecret,
    planIds: { portfolio: "plan_portfolio" },
  });

  const result = await service.handleWebhook({ rawBody, signature });
  assert.equal(result.processed, true);
  assert.equal(updated, true);
});
