# Razorpay subscription setup

DomainPulse uses Razorpay Subscriptions with server-created subscriptions,
mandatory checkout signature verification, and signed webhooks. Configure and
test everything in Razorpay Test Mode before enabling domain limits or using
live keys.

## Plans

Create these monthly USD plans in **Razorpay Dashboard → Subscriptions → Plans**:

| DomainPulse plan | Monthly amount | Domain limit |
| --- | ---: | ---: |
| Starter | $9 | 25 |
| Pro | $19 | 100 |
| Portfolio | $49 | 1,000 |

Razorpay plans cannot be edited or deleted after creation. Confirm the currency,
amount, and monthly billing frequency before saving each plan.

## Render environment

Add the Test Mode values to the DomainPulse backend service:

```text
RAZORPAY_KEY_ID=key_test_xxxxxxxxx
RAZORPAY_KEY_SECRET=your-test-key-secret
RAZORPAY_WEBHOOK_SECRET=a-separate-random-webhook-secret
RAZORPAY_PLAN_STARTER_ID=plan_xxxxxxxxx
RAZORPAY_PLAN_PRO_ID=plan_xxxxxxxxx
RAZORPAY_PLAN_PORTFOLIO_ID=plan_xxxxxxxxx
BILLING_ENFORCEMENT_ENABLED=false
```

Keep `BILLING_ENFORCEMENT_ENABLED=false` until checkout, verification, webhook,
cancellation, and renewal behavior have all been tested successfully.

## Webhook

Create a Test Mode webhook with this URL:

```text
https://api.domainpulsehq.com/api/webhooks/razorpay
```

Use the same webhook secret in Razorpay and Render. Enable the subscription
events needed to follow the full lifecycle, including authenticated, activated,
charged, pending, halted, paused, resumed, cancelled, and completed.

DomainPulse verifies `X-Razorpay-Signature` against the exact raw request body.
The webhook secret is separate from the Razorpay API key secret.

## Safe rollout

1. Deploy with Test Mode keys and enforcement disabled.
2. Complete one Starter subscription using Razorpay test credentials.
3. Confirm the dashboard changes from Free to Starter.
4. Confirm the subscription row in Neon and webhook delivery in Razorpay.
5. Test cancellation at the end of the billing cycle.
6. Request international payments from Razorpay before charging in USD live.
7. Replace Test Mode values with Live Mode values only after approval.
8. Enable `BILLING_ENFORCEMENT_ENABLED=true` last.
