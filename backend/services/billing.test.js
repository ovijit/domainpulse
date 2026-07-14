import test from "node:test";
import assert from "node:assert/strict";
import {
  BillingError,
  createBillingService,
  PLAN_CATALOG,
} from "./billing.js";

function summaryRow(overrides = {}) {
  return {
    plan_key: null,
    payment_provider: null,
    provider_subscription_id: null,
    status: null,
    current_start: null,
    current_end: null,
    cancel_at_cycle_end: false,
    domain_count: 2,
    ...overrides,
  };
}

function mockPaddle(event) {
  return {
    webhooks: {
      async unmarshal() {
        if (event instanceof Error) throw event;
        return event;
      },
    },
    subscriptions: {
      async cancel() {
        throw new Error("Not implemented in this test");
      },
    },
  };
}

test("free accounts receive the free entitlement", async () => {
  const service = createBillingService({
    pool: { query: async () => ({ rows: [summaryRow()] }) },
    enforcementEnabled: true,
    priceIds: {},
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
    priceIds: {},
  });
  const preview = createBillingService({
    pool,
    enforcementEnabled: false,
    priceIds: {},
  });

  await assert.rejects(
    enforced.assertCapacity(7, 1),
    (error) =>
      error instanceof BillingError && error.code === "domain_limit_reached"
  );
  await assert.doesNotReject(preview.assertCapacity(7, 1));
});

test("checkout configuration is signed for the authenticated user", async () => {
  const service = createBillingService({
    pool: { query: async () => ({ rows: [summaryRow()] }) },
    apiKey: "pdl_sdbx_test",
    clientToken: "test_client_token",
    webhookSecret: "pdl_ntfset_test",
    checkoutSecret: "checkout_secret",
    priceIds: { pro: "pri_pro" },
    paddleClient: mockPaddle(),
    now: () => 1_700_000_000_000,
  });

  const result = await service.createCheckout({
    user: { id: 7, name: "Avijit", email: "avijit@example.com" },
    planKey: "pro",
  });

  assert.equal(result.provider, "paddle");
  assert.equal(result.environment, "sandbox");
  assert.equal(result.price_id, "pri_pro");
  assert.match(result.checkout_token, /^[^.]+\.[^.]+$/);
  assert.equal(result.plan, PLAN_CATALOG.pro);
});

test("a verified Paddle subscription webhook activates the matching plan", async () => {
  const queries = [];
  let event;
  const pool = {
    async query(sql, params) {
      queries.push({ sql, params });

      if (sql.includes("FROM users u")) {
        return { rows: [summaryRow()] };
      }

      if (sql.includes("SELECT user_id")) {
        return { rows: [] };
      }

      return { rows: [] };
    },
  };
  const paddleClient = {
    webhooks: {
      async unmarshal() {
        return event;
      },
    },
    subscriptions: {},
  };
  const service = createBillingService({
    pool,
    apiKey: "pdl_sdbx_test",
    clientToken: "test_client_token",
    webhookSecret: "pdl_ntfset_test",
    checkoutSecret: "checkout_secret",
    priceIds: { portfolio: "pri_portfolio" },
    paddleClient,
    now: () => 1_700_000_000_000,
  });
  const checkout = await service.createCheckout({
    user: { id: 9, name: "Avijit", email: "avijit@example.com" },
    planKey: "portfolio",
  });

  event = {
    eventType: "subscription.created",
    occurredAt: new Date(1_700_000_010_000).toISOString(),
    data: {
      id: "sub_456",
      customerId: "ctm_456",
      status: "active",
      updatedAt: new Date(1_700_000_010_000).toISOString(),
      currentBillingPeriod: {
        startsAt: "2026-07-01T00:00:00.000Z",
        endsAt: "2026-08-01T00:00:00.000Z",
      },
      scheduledChange: null,
      customData: {
        domainpulse_checkout_token: checkout.checkout_token,
      },
      items: [{ price: { id: "pri_portfolio" } }],
    },
  };

  const result = await service.handleWebhook({
    rawBody: Buffer.from("{}"),
    signature: "ts=1;h1=test",
  });

  assert.equal(result.processed, true);
  const insert = queries.find(({ sql }) =>
    sql.includes("INSERT INTO user_subscriptions")
  );
  assert.ok(insert);
  assert.equal(insert.params[0], 9);
  assert.equal(insert.params[1], "portfolio");
  assert.equal(insert.params[3], "sub_456");
});

test("a checkout token cannot unlock a different Paddle price", async () => {
  let event;
  const pool = {
    async query(sql) {
      if (sql.includes("FROM users u")) {
        return { rows: [summaryRow()] };
      }
      return { rows: [] };
    },
  };
  const paddleClient = {
    webhooks: { async unmarshal() { return event; } },
    subscriptions: {},
  };
  const service = createBillingService({
    pool,
    apiKey: "pdl_sdbx_test",
    clientToken: "test_client_token",
    webhookSecret: "pdl_ntfset_test",
    checkoutSecret: "checkout_secret",
    priceIds: { starter: "pri_starter", pro: "pri_pro" },
    paddleClient,
    now: () => 1_700_000_000_000,
  });
  const checkout = await service.createCheckout({
    user: { id: 7, name: "Avijit", email: "avijit@example.com" },
    planKey: "starter",
  });

  event = {
    eventType: "subscription.created",
    occurredAt: new Date(1_700_000_010_000).toISOString(),
    data: {
      id: "sub_wrong_plan",
      status: "active",
      customData: {
        domainpulse_checkout_token: checkout.checkout_token,
      },
      items: [{ price: { id: "pri_pro" } }],
    },
  };

  const result = await service.handleWebhook({
    rawBody: Buffer.from("{}"),
    signature: "ts=1;h1=test",
  });

  assert.equal(result.processed, false);
});

test("Paddle cancellation is scheduled at the end of the billing period", async () => {
  let canceledSubscriptionId;
  const pool = {
    async query(sql) {
      if (sql.includes("SELECT payment_provider")) {
        return {
          rows: [
            {
              payment_provider: "paddle",
              provider_subscription_id: "sub_active",
            },
          ],
        };
      }

      if (sql.includes("FROM users u")) {
        return {
          rows: [
            summaryRow({
              plan_key: "pro",
              payment_provider: "paddle",
              provider_subscription_id: "sub_active",
              status: "active",
              cancel_at_cycle_end: true,
            }),
          ],
        };
      }

      return { rows: [] };
    },
  };
  const service = createBillingService({
    pool,
    apiKey: "pdl_sdbx_test",
    priceIds: { pro: "pri_pro" },
    paddleClient: {
      webhooks: {},
      subscriptions: {
        async cancel(subscriptionId) {
          canceledSubscriptionId = subscriptionId;
          return {
            id: subscriptionId,
            customerId: "ctm_123",
            status: "active",
            updatedAt: "2026-07-14T10:00:00.000Z",
            currentBillingPeriod: {
              startsAt: "2026-07-01T00:00:00.000Z",
              endsAt: "2026-08-01T00:00:00.000Z",
            },
            scheduledChange: { action: "cancel" },
            items: [{ price: { id: "pri_pro" } }],
          };
        },
      },
    },
  });

  const result = await service.cancelSubscription(7);

  assert.equal(canceledSubscriptionId, "sub_active");
  assert.equal(result.subscription.cancel_at_cycle_end, true);
});

test("invalid Paddle webhook signatures are rejected", async () => {
  const service = createBillingService({
    pool: { query: async () => ({ rows: [] }) },
    apiKey: "pdl_sdbx_test",
    webhookSecret: "pdl_ntfset_test",
    paddleClient: mockPaddle(new Error("signature mismatch")),
  });

  await assert.rejects(
    service.handleWebhook({ rawBody: Buffer.from("{}"), signature: "bad" }),
    (error) =>
      error instanceof BillingError &&
      error.code === "invalid_webhook_signature"
  );
});
