# Paddle subscription setup

DomainPulse uses Paddle Billing for monthly subscriptions. Paddle.js creates the
checkout, while signed Paddle webhooks are the only source of truth for granting
paid plan limits. Start in Paddle Sandbox and keep billing enforcement disabled
until the complete lifecycle has been tested.

## 1. Create the Sandbox catalog

In **Paddle Sandbox → Catalog**, create a DomainPulse product and three recurring
monthly USD prices:

| DomainPulse plan | Monthly amount | Domain limit |
| --- | ---: | ---: |
| Starter | $9 | 25 |
| Pro | $19 | 100 |
| Portfolio | $49 | 1,000 |

Copy each price ID. Paddle price IDs start with `pri_`. Sandbox and live catalog
IDs are different, so live prices must be created separately later.

## 2. Create Sandbox credentials

Under **Developer tools → Authentication**:

1. Create a Sandbox API key with subscription read/write access.
2. Create a client-side token for Paddle.js.
3. Keep both values private until they are added to Render. The client-side
   token is safe for checkout use, but the API key must never reach the browser.

Sandbox API keys include `_sdbx`, and Sandbox client-side tokens begin with
`test_`.

## 3. Configure the webhook

Under **Developer tools → Notifications**, create a Sandbox destination:

```text
https://api.domainpulsehq.com/api/webhooks/paddle
```

Subscribe it to all subscription lifecycle events, including created, activated,
updated, past due, paused, resumed, and canceled. Copy the destination secret;
it starts with `pdl_ntfset_`.

DomainPulse verifies the `Paddle-Signature` header against the exact raw request
body using Paddle's official Node SDK. Never use the API key as the webhook
secret.

## 4. Add the Render environment variables

Add these values to the DomainPulse backend service:

```text
PADDLE_ENVIRONMENT=sandbox
PADDLE_API_KEY=pdl_sdbx_apikey_xxxxxxxxx
PADDLE_CLIENT_TOKEN=test_xxxxxxxxx
PADDLE_WEBHOOK_SECRET=pdl_ntfset_xxxxxxxxx
PADDLE_CHECKOUT_SECRET=a-separate-random-secret
PADDLE_PRICE_STARTER_ID=pri_xxxxxxxxx
PADDLE_PRICE_PRO_ID=pri_xxxxxxxxx
PADDLE_PRICE_PORTFOLIO_ID=pri_xxxxxxxxx
BILLING_ENFORCEMENT_ENABLED=false
```

Generate `PADDLE_CHECKOUT_SECRET` locally with:

```bash
openssl rand -hex 32
```

This secret signs the short-lived metadata that binds a Paddle checkout to the
correct authenticated DomainPulse user and plan.

No Paddle secret or price environment variable is required in Vercel. The
authenticated backend sends the browser only the client-side token, selected
price ID, and signed checkout metadata.

## 5. Approve the checkout domain

Add `domainpulsehq.com` under Paddle's checkout website settings and complete
Paddle's domain review before using the live account. Localhost can be used for
Sandbox testing.

## 6. Deploy and test safely

1. Deploy the backend with the Sandbox values above.
2. Open **Plans & billing** in DomainPulse and buy the Starter plan with a
   Paddle Sandbox payment method.
3. Confirm Paddle shows a completed checkout.
4. Confirm the dashboard changes from Free to Starter after the webhook arrives.
5. Confirm a Paddle row exists in Neon's `user_subscriptions` table.
6. Confirm the Paddle notification delivery returned HTTP 200.
7. Cancel the subscription and confirm `Cancellation scheduled` appears while
   access remains active until the current period ends.
8. Test a failed payment or past-due simulation and confirm the account returns
   to Free when it is no longer entitled.

If Paddle has accepted payment but the dashboard has not updated yet, inspect
the notification delivery first. DomainPulse intentionally does not trust a
browser-only checkout success event for granting access.

## 7. Move to Live

After Paddle approves the business and website:

1. Recreate the three monthly prices in the live catalog.
2. Create a live API key and live client-side token.
3. Create the live notification destination and copy its new secret.
4. Replace every Sandbox credential and price ID in Render.
5. Change `PADDLE_ENVIRONMENT=production`.
6. Complete one real low-risk subscription and cancellation test.
7. Set `BILLING_ENFORCEMENT_ENABLED=true` only after every step succeeds.

The database migration keeps legacy Razorpay columns for historical records,
but all new DomainPulse checkouts and subscription updates use Paddle.
