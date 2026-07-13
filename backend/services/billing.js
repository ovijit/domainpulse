import crypto from "crypto";
import Razorpay from "razorpay";

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

const ENTITLED_STATUSES = new Set(["authenticated", "active"]);

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

function epochToDate(value) {
  return value ? new Date(Number(value) * 1000) : null;
}

export function createBillingService(options) {
  const {
    pool,
    keyId = process.env.RAZORPAY_KEY_ID,
    keySecret = process.env.RAZORPAY_KEY_SECRET,
    webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET,
    enforcementEnabled = process.env.BILLING_ENFORCEMENT_ENABLED === "true",
    planIds = {
      starter: process.env.RAZORPAY_PLAN_STARTER_ID,
      pro: process.env.RAZORPAY_PLAN_PRO_ID,
      portfolio: process.env.RAZORPAY_PLAN_PORTFOLIO_ID,
    },
    razorpayClient,
  } = options;
  const razorpay =
    razorpayClient ||
    (keyId && keySecret
      ? new Razorpay({ key_id: keyId, key_secret: keySecret })
      : null);
  const planKeyById = new Map(
    Object.entries(planIds)
      .filter(([, id]) => Boolean(id))
      .map(([key, id]) => [id, key])
  );

  function publicPlans() {
    return Object.values(PLAN_CATALOG).map((plan) => ({
      ...plan,
      configured: plan.key === "free" || Boolean(planIds[plan.key]),
    }));
  }

  function requireRazorpay() {
    if (!razorpay || !keyId || !keySecret) {
      throw new BillingError(
        "Razorpay Test Mode is not configured",
        503,
        "billing_not_configured"
      );
    }
  }

  function resolvePlanKey(subscription) {
    const notesPlan = subscription?.notes?.plan_key;
    if (notesPlan && PLAN_CATALOG[notesPlan]) return notesPlan;
    return planKeyById.get(subscription?.plan_id) || null;
  }

  async function upsertSubscription({ userId, planKey, subscription }) {
    await pool.query(
      `
        INSERT INTO user_subscriptions (
          user_id,
          plan_key,
          razorpay_plan_id,
          razorpay_subscription_id,
          status,
          current_start,
          current_end,
          cancel_at_cycle_end,
          updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
        ON CONFLICT (user_id)
        DO UPDATE SET
          plan_key = EXCLUDED.plan_key,
          razorpay_plan_id = EXCLUDED.razorpay_plan_id,
          razorpay_subscription_id = EXCLUDED.razorpay_subscription_id,
          status = EXCLUDED.status,
          current_start = EXCLUDED.current_start,
          current_end = EXCLUDED.current_end,
          cancel_at_cycle_end = EXCLUDED.cancel_at_cycle_end,
          updated_at = NOW()
        WHERE
          user_subscriptions.razorpay_subscription_id = EXCLUDED.razorpay_subscription_id
          OR user_subscriptions.status NOT IN ('authenticated', 'active')
      `,
      [
        userId,
        planKey,
        subscription.plan_id,
        subscription.id,
        subscription.status || "created",
        epochToDate(subscription.current_start),
        epochToDate(subscription.current_end),
        Boolean(subscription.cancel_at_cycle_end),
      ]
    );
  }

  async function getSummary(userId) {
    const result = await pool.query(
      `
        SELECT
          s.plan_key,
          s.razorpay_subscription_id,
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
          s.razorpay_subscription_id,
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
      subscription: row.razorpay_subscription_id
        ? {
            id: row.razorpay_subscription_id,
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
      checkout_configured: Boolean(razorpay && keyId && keySecret),
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

  async function createSubscription({ user, planKey }) {
    requireRazorpay();
    const plan = PLAN_CATALOG[planKey];
    const planId = planIds[planKey];

    if (!plan || planKey === "free") {
      throw new BillingError("Choose a paid plan", 400, "invalid_plan");
    }

    if (!planId) {
      throw new BillingError(
        `${plan.name} is not configured in Razorpay`,
        503,
        "plan_not_configured"
      );
    }

    const current = await getSummary(user.id);
    if (
      current.subscription?.status === "created" &&
      current.subscription.plan_key === planKey
    ) {
      return {
        key_id: keyId,
        subscription_id: current.subscription.id,
        plan,
        customer: { name: user.name, email: user.email },
      };
    }

    if (
      current.subscription &&
      ENTITLED_STATUSES.has(current.subscription.status)
    ) {
      throw new BillingError(
        "Cancel the current subscription before choosing another plan",
        409,
        "subscription_exists"
      );
    }

    const subscription = await razorpay.subscriptions.create({
      plan_id: planId,
      total_count: 120,
      customer_notify: 1,
      notes: {
        user_id: String(user.id),
        user_email: user.email,
        plan_key: planKey,
      },
    });

    await upsertSubscription({ userId: user.id, planKey, subscription });

    return {
      key_id: keyId,
      subscription_id: subscription.id,
      plan,
      customer: { name: user.name, email: user.email },
    };
  }

  async function verifyCheckout({
    userId,
    paymentId,
    subscriptionId,
    signature,
  }) {
    requireRazorpay();

    if (!paymentId || !subscriptionId || !signature) {
      throw new BillingError(
        "Incomplete Razorpay verification response",
        400,
        "verification_incomplete"
      );
    }

    const expected = crypto
      .createHmac("sha256", keySecret)
      .update(`${paymentId}|${subscriptionId}`)
      .digest("hex");

    if (!secureEqual(signature, expected)) {
      throw new BillingError(
        "Payment signature could not be verified",
        401,
        "invalid_payment_signature"
      );
    }

    const subscription = await razorpay.subscriptions.fetch(subscriptionId);
    const notesUserId = Number(subscription?.notes?.user_id);
    const planKey = resolvePlanKey(subscription);

    if (notesUserId !== userId || !planKey) {
      throw new BillingError(
        "Subscription does not belong to this account",
        403,
        "subscription_owner_mismatch"
      );
    }

    await upsertSubscription({ userId, planKey, subscription });
    return getSummary(userId);
  }

  async function cancelSubscription(userId) {
    requireRazorpay();
    const result = await pool.query(
      `
        SELECT razorpay_subscription_id
        FROM user_subscriptions
        WHERE user_id = $1
      `,
      [userId]
    );
    const subscriptionId = result.rows[0]?.razorpay_subscription_id;

    if (!subscriptionId) {
      throw new BillingError(
        "No subscription was found",
        404,
        "subscription_not_found"
      );
    }

    const subscription = await razorpay.subscriptions.cancel(
      subscriptionId,
      { cancel_at_cycle_end: true }
    );
    const planKey = resolvePlanKey(subscription);

    if (planKey) {
      await upsertSubscription({ userId, planKey, subscription });
    }

    return getSummary(userId);
  }

  async function handleWebhook({ rawBody, signature }) {
    if (!webhookSecret) {
      throw new BillingError(
        "Razorpay webhook is not configured",
        503,
        "webhook_not_configured"
      );
    }

    const expected = crypto
      .createHmac("sha256", webhookSecret)
      .update(rawBody)
      .digest("hex");

    if (!secureEqual(signature, expected)) {
      throw new BillingError(
        "Invalid webhook signature",
        401,
        "invalid_webhook_signature"
      );
    }

    const event = JSON.parse(rawBody.toString("utf8"));
    const subscription = event?.payload?.subscription?.entity;

    if (!subscription?.id) {
      return { processed: false, event: event.event };
    }

    const userId = Number(subscription?.notes?.user_id);
    const planKey = resolvePlanKey(subscription);

    if (!Number.isInteger(userId) || !planKey) {
      return { processed: false, event: event.event };
    }

    await upsertSubscription({ userId, planKey, subscription });
    return { processed: true, event: event.event };
  }

  return {
    publicPlans,
    getSummary,
    assertCapacity,
    createSubscription,
    verifyCheckout,
    cancelSubscription,
    handleWebhook,
  };
}
