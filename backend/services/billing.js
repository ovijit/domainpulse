import crypto from "crypto";
import { Environment, Paddle } from "@paddle/paddle-node-sdk";

export const PLAN_CATALOG = Object.freeze({
  free: {
    key: "free",
    name: "Free",
    price_usd: 0,
    domain_limit: 5,
    description: "Try DomainPulse with a small portfolio.",
  },
  starter: {
    key: "starter",
    name: "Starter",
    price_usd: 9,
    domain_limit: 25,
    description: "Essential monitoring for a growing portfolio.",
  },
  pro: {
    key: "pro",
    name: "Pro",
    price_usd: 19,
    domain_limit: 100,
    description: "Bulk monitoring for active domain investors.",
  },
  portfolio: {
    key: "portfolio",
    name: "Portfolio",
    price_usd: 49,
    domain_limit: 1000,
    description: "Serious coverage for large domain portfolios.",
  },
});

const ENTITLED_STATUSES = new Set(["active", "trialing", "authenticated"]);
const TERMINAL_STATUSES = new Set(["canceled", "completed"]);
const CHECKOUT_TOKEN_TTL_MS = 30 * 60 * 1000;

export class BillingError extends Error {
  constructor(message, statusCode = 400, code = "billing_error") {
    super(message);
    this.name = "BillingError";
    this.statusCode = statusCode;
    this.code = code;
  }
}

function secureEqual(value, expected) {
  const valueBuffer = Buffer.from(value || "", "utf8");
  const expectedBuffer = Buffer.from(expected || "", "utf8");
  return (
    valueBuffer.length === expectedBuffer.length &&
    crypto.timingSafeEqual(valueBuffer, expectedBuffer)
  );
}

function toDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function createBillingService(options) {
  const {
    pool,
    apiKey = process.env.PADDLE_API_KEY,
    clientToken = process.env.PADDLE_CLIENT_TOKEN,
    webhookSecret = process.env.PADDLE_WEBHOOK_SECRET,
    checkoutSecret =
      process.env.PADDLE_CHECKOUT_SECRET || process.env.JWT_SECRET,
    environmentName = process.env.PADDLE_ENVIRONMENT || "sandbox",
    enforcementEnabled = process.env.BILLING_ENFORCEMENT_ENABLED === "true",
    priceIds = {
      starter: process.env.PADDLE_PRICE_STARTER_ID,
      pro: process.env.PADDLE_PRICE_PRO_ID,
      portfolio: process.env.PADDLE_PRICE_PORTFOLIO_ID,
    },
    paddleClient,
    now = () => Date.now(),
  } = options;

  const environment =
    environmentName === "production"
      ? Environment.production
      : Environment.sandbox;
  const paddle =
    paddleClient ||
    (apiKey ? new Paddle(apiKey, { environment }) : null);
  const planKeyByPriceId = new Map(
    Object.entries(priceIds)
      .filter(([, id]) => Boolean(id))
      .map(([key, id]) => [id, key])
  );
  const baseConfigurationReady = Boolean(
    paddle && clientToken && webhookSecret && checkoutSecret
  );
  const checkoutConfigurationReady =
    baseConfigurationReady &&
    ["starter", "pro", "portfolio"].every((key) => Boolean(priceIds[key]));

  function publicPlans() {
    return Object.values(PLAN_CATALOG).map((plan) => ({
      ...plan,
      configured:
        plan.key === "free" ||
        (baseConfigurationReady && Boolean(priceIds[plan.key])),
    }));
  }

  function requirePaddle() {
    if (!paddle || !apiKey) {
      throw new BillingError(
        "Paddle is not fully configured",
        503,
        "billing_not_configured"
      );
    }
  }

  function requireCheckout(planKey) {
    const plan = PLAN_CATALOG[planKey];

    if (!plan || planKey === "free") {
      throw new BillingError("Choose a paid plan", 400, "invalid_plan");
    }

    if (!baseConfigurationReady) {
      throw new BillingError(
        "Paddle Sandbox is not fully configured",
        503,
        "billing_not_configured"
      );
    }

    if (!priceIds[planKey]) {
      throw new BillingError(
        `${plan.name} is not configured in Paddle`,
        503,
        "plan_not_configured"
      );
    }

    return plan;
  }

  function signCheckoutToken({ userId, planKey }) {
    const issuedAt = now();
    const payload = Buffer.from(
      JSON.stringify({
        version: 1,
        user_id: Number(userId),
        plan_key: planKey,
        issued_at: issuedAt,
        expires_at: issuedAt + CHECKOUT_TOKEN_TTL_MS,
      })
    ).toString("base64url");
    const signature = crypto
      .createHmac("sha256", checkoutSecret)
      .update(payload)
      .digest("base64url");

    return `${payload}.${signature}`;
  }

  function verifyCheckoutToken(token, occurredAt) {
    if (!checkoutSecret || typeof token !== "string") return null;

    const [payload, signature, extra] = token.split(".");
    if (!payload || !signature || extra) return null;

    const expected = crypto
      .createHmac("sha256", checkoutSecret)
      .update(payload)
      .digest("base64url");
    if (!secureEqual(signature, expected)) return null;

    try {
      const claims = JSON.parse(
        Buffer.from(payload, "base64url").toString("utf8")
      );
      const eventTime = occurredAt ? new Date(occurredAt).getTime() : now();

      if (
        claims.version !== 1 ||
        !Number.isInteger(claims.user_id) ||
        !PLAN_CATALOG[claims.plan_key] ||
        !Number.isFinite(eventTime) ||
        eventTime < claims.issued_at - 5 * 60 * 1000 ||
        eventTime > claims.expires_at
      ) {
        return null;
      }

      return claims;
    } catch {
      return null;
    }
  }

  function resolvePlanKey(subscription) {
    for (const item of subscription?.items || []) {
      const planKey = planKeyByPriceId.get(item?.price?.id);
      if (planKey) return planKey;
    }

    return null;
  }

  function subscriptionDates(subscription) {
    return {
      currentStart: toDate(subscription?.currentBillingPeriod?.startsAt),
      currentEnd: toDate(subscription?.currentBillingPeriod?.endsAt),
    };
  }

  async function upsertSubscription({
    userId,
    planKey,
    subscription,
    occurredAt,
  }) {
    const priceId = subscription?.items?.find((item) =>
      planKeyByPriceId.has(item?.price?.id)
    )?.price?.id;
    const { currentStart, currentEnd } = subscriptionDates(subscription);
    const providerUpdatedAt =
      toDate(occurredAt) || toDate(subscription.updatedAt) || new Date(now());

    await pool.query(
      `
        INSERT INTO user_subscriptions (
          user_id,
          plan_key,
          payment_provider,
          provider_price_id,
          provider_subscription_id,
          provider_customer_id,
          status,
          current_start,
          current_end,
          cancel_at_cycle_end,
          provider_updated_at,
          updated_at
        )
        VALUES ($1, $2, 'paddle', $3, $4, $5, $6, $7, $8, $9, $10, NOW())
        ON CONFLICT (user_id)
        DO UPDATE SET
          plan_key = EXCLUDED.plan_key,
          payment_provider = EXCLUDED.payment_provider,
          provider_price_id = EXCLUDED.provider_price_id,
          provider_subscription_id = EXCLUDED.provider_subscription_id,
          provider_customer_id = EXCLUDED.provider_customer_id,
          status = EXCLUDED.status,
          current_start = EXCLUDED.current_start,
          current_end = EXCLUDED.current_end,
          cancel_at_cycle_end = EXCLUDED.cancel_at_cycle_end,
          provider_updated_at = EXCLUDED.provider_updated_at,
          updated_at = NOW()
        WHERE
          (
            user_subscriptions.payment_provider = 'paddle'
            AND user_subscriptions.provider_subscription_id = EXCLUDED.provider_subscription_id
            AND (
              user_subscriptions.provider_updated_at IS NULL
              OR user_subscriptions.provider_updated_at <= EXCLUDED.provider_updated_at
            )
          )
          OR (
            user_subscriptions.status NOT IN ('active', 'trialing', 'authenticated')
            AND EXCLUDED.status IN ('active', 'trialing')
          )
      `,
      [
        userId,
        planKey,
        priceId,
        subscription.id,
        subscription.customerId || null,
        subscription.status || "active",
        currentStart,
        currentEnd,
        subscription?.scheduledChange?.action === "cancel",
        providerUpdatedAt,
      ]
    );
  }

  async function getSummary(userId) {
    const result = await pool.query(
      `
        SELECT
          s.plan_key,
          s.payment_provider,
          s.provider_subscription_id,
          s.status,
          s.current_start,
          s.current_end,
          s.cancel_at_cycle_end,
          COUNT(d.id)::INTEGER AS domain_count
        FROM users u
        LEFT JOIN user_subscriptions s ON s.user_id = u.id
        LEFT JOIN domains d ON d.user_id = u.id
        WHERE u.id = $1
        GROUP BY
          s.plan_key,
          s.payment_provider,
          s.provider_subscription_id,
          s.status,
          s.current_start,
          s.current_end,
          s.cancel_at_cycle_end
      `,
      [userId]
    );
    const row = result.rows[0] || {};
    const paidPlan =
      row.plan_key && ENTITLED_STATUSES.has(row.status)
        ? PLAN_CATALOG[row.plan_key]
        : null;
    const plan = paidPlan || PLAN_CATALOG.free;

    return {
      plan,
      subscription: row.provider_subscription_id
        ? {
            id: row.provider_subscription_id,
            provider: row.payment_provider,
            plan_key: row.plan_key,
            status: row.status,
            current_start: row.current_start,
            current_end: row.current_end,
            cancel_at_cycle_end: Boolean(row.cancel_at_cycle_end),
          }
        : null,
      usage: {
        domains: Number(row.domain_count || 0),
        domain_limit: plan.domain_limit,
        remaining_domains: Math.max(
          plan.domain_limit - Number(row.domain_count || 0),
          0
        ),
      },
      enforcement_enabled: enforcementEnabled,
      checkout_configured: checkoutConfigurationReady,
    };
  }

  async function assertCapacity(userId, additionalDomains = 1) {
    const summary = await getSummary(userId);

    if (
      enforcementEnabled &&
      summary.usage.domains + additionalDomains > summary.plan.domain_limit
    ) {
      throw new BillingError(
        `${summary.plan.name} supports up to ${summary.plan.domain_limit} domains. Upgrade to add more.`,
        403,
        "domain_limit_reached"
      );
    }

    return summary;
  }

  async function createCheckout({ user, planKey }) {
    const plan = requireCheckout(planKey);
    const current = await getSummary(user.id);

    if (
      current.subscription &&
      !TERMINAL_STATUSES.has(current.subscription.status)
    ) {
      throw new BillingError(
        "Cancel the current subscription before choosing another plan",
        409,
        "subscription_exists"
      );
    }

    return {
      provider: "paddle",
      environment: environmentName === "production" ? "production" : "sandbox",
      client_token: clientToken,
      price_id: priceIds[planKey],
      checkout_token: signCheckoutToken({ userId: user.id, planKey }),
      plan,
      customer: { name: user.name, email: user.email },
    };
  }

  async function cancelSubscription(userId) {
    requirePaddle();
    const result = await pool.query(
      `
        SELECT payment_provider, provider_subscription_id
        FROM user_subscriptions
        WHERE user_id = $1
      `,
      [userId]
    );
    const row = result.rows[0];

    if (!row?.provider_subscription_id) {
      throw new BillingError(
        "No subscription was found",
        404,
        "subscription_not_found"
      );
    }

    if (row.payment_provider !== "paddle") {
      throw new BillingError(
        "This legacy subscription must be managed with its original payment provider",
        409,
        "legacy_subscription"
      );
    }

    const subscription = await paddle.subscriptions.cancel(
      row.provider_subscription_id
    );
    const planKey = resolvePlanKey(subscription);

    if (planKey) {
      await upsertSubscription({
        userId,
        planKey,
        subscription,
        occurredAt: subscription.updatedAt,
      });
    }

    return getSummary(userId);
  }

  async function findUserIdBySubscriptionId(subscriptionId) {
    const result = await pool.query(
      `
        SELECT user_id
        FROM user_subscriptions
        WHERE payment_provider = 'paddle'
          AND provider_subscription_id = $1
      `,
      [subscriptionId]
    );
    return result.rows[0]?.user_id || null;
  }

  async function handleWebhook({ rawBody, signature }) {
    requirePaddle();

    if (!webhookSecret) {
      throw new BillingError(
        "Paddle webhook is not configured",
        503,
        "webhook_not_configured"
      );
    }

    let event;
    try {
      event = await paddle.webhooks.unmarshal(
        rawBody.toString("utf8"),
        webhookSecret,
        signature
      );
    } catch {
      throw new BillingError(
        "Invalid webhook signature",
        401,
        "invalid_webhook_signature"
      );
    }

    if (!event?.eventType?.startsWith("subscription.") || !event.data?.id) {
      return { processed: false, event: event?.eventType || "unknown" };
    }

    const subscription = event.data;
    const planKey = resolvePlanKey(subscription);
    if (!planKey) {
      return { processed: false, event: event.eventType };
    }

    let userId = await findUserIdBySubscriptionId(subscription.id);

    if (!userId) {
      const customData = subscription.customData || {};
      const token =
        customData.domainpulse_checkout_token ||
        customData.domainpulseCheckoutToken;
      const claims = verifyCheckoutToken(token, event.occurredAt);

      if (!claims || claims.plan_key !== planKey) {
        return { processed: false, event: event.eventType };
      }

      userId = claims.user_id;
    }

    await upsertSubscription({
      userId,
      planKey,
      subscription,
      occurredAt: event.occurredAt,
    });

    return { processed: true, event: event.eventType };
  }

  return {
    publicPlans,
    getSummary,
    assertCapacity,
    createCheckout,
    cancelSubscription,
    handleWebhook,
  };
}
