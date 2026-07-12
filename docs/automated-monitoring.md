# Automated monitoring setup

DomainPulse checks every user-owned domain every six hours through GitHub Actions. The workflow calls a protected backend endpoint, which wakes the Render service, resolves current nameservers, stores baselines and changes, and sends an email when an established nameserver set changes.

## 1. Configure email delivery

1. Create a Resend account.
2. Add and verify a sending domain.
3. Create a Resend API key.
4. Add these Render environment variables:

```text
RESEND_API_KEY=re_xxxxxxxxx
ALERT_FROM_EMAIL=DomainPulse <alerts@domainpulsehq.com>
```

`ALERT_FROM_EMAIL` must use a domain verified in Resend.

The same configuration sends two types of email:

- A confirmation after a signed-in user successfully adds a domain.
- An alert when a later monitoring check detects a nameserver change.

If Resend is temporarily unavailable, adding the domain still succeeds. The API
returns `email_status: "failed"` or `email_status: "skipped"` while the domain
remains safely stored in the user's account.

## 2. Configure scheduler authentication

Generate a separate long random secret and add it to Render:

```text
CRON_SECRET=your-long-random-secret
```

In GitHub, open **Settings → Secrets and variables → Actions**, create a repository secret named `DOMAINPULSE_CRON_SECRET`, and use the exact same value.

Never commit either secret to the repository.

## 3. Deploy and test

1. Deploy the backend after setting the Render variables.
2. Open **GitHub → Actions → DomainPulse scheduled monitoring**.
3. Select **Run workflow**.
4. Confirm the workflow succeeds.
5. Open a domain drawer in DomainPulse and confirm that **Monitoring history** contains a baseline event.

The first successful check establishes a baseline and does not send an alert. Email is sent only when a later check finds a different nameserver set.
