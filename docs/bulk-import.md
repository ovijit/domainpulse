# Bulk domain import

Signed-in users can add up to 100 domains in one request through
`POST /api/domains/bulk`.

## Request

```json
{
  "domains": ["example.com", "portfolio.xyz", "startup.io"]
}
```

The backend normalizes URLs, validates every domain, removes repeated entries,
and skips domains that the user already monitors. New domains are inserted with
one conflict-safe database query.

After insertion, DomainPulse runs initial nameserver checks with a concurrency
limit of five. One summary email reports added, duplicate, invalid, successful
baseline, and failed baseline counts. The bulk endpoint never sends one email
per domain.
