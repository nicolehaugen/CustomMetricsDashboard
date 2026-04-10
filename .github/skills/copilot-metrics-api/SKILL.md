---
name: copilot-metrics-api
description: "Reference for the GitHub Copilot Metrics Reports API. Covers correct endpoints, gh api commands, current vs retired status, and the download_links/NDJSON response pattern. WHEN: 'what is the Copilot metrics endpoint', 'how do I call the Copilot API', 'get Copilot usage data', 'Copilot metrics for my org', 'which Copilot endpoints are valid'."
---

# Copilot Metrics API Reference

## Current Endpoints ✅

Use **ONLY** the Copilot Metrics Reports API (`/copilot/metrics/reports/...`). These endpoints return a `download_links` envelope — not inline JSON. Each link points to a report file in NDJSON format (one JSON object per line).

### Organization-scoped

| Report | Endpoint |
|--------|----------|
| Org 28-day summary | `GET /orgs/{org}/copilot/metrics/reports/organization-28-day/latest` |
| Org 1-day snapshot | `GET /orgs/{org}/copilot/metrics/reports/organization-1-day?day=YYYY-MM-DD` |
| Org users 28-day | `GET /orgs/{org}/copilot/metrics/reports/users-28-day/latest` |
| Org users 1-day | `GET /orgs/{org}/copilot/metrics/reports/users-1-day?day=YYYY-MM-DD` |

### Enterprise-scoped

| Report | Endpoint |
|--------|----------|
| Enterprise 28-day summary | `GET /enterprises/{enterprise}/copilot/metrics/reports/enterprise-28-day/latest` |
| Enterprise 1-day snapshot | `GET /enterprises/{enterprise}/copilot/metrics/reports/enterprise-1-day?day=YYYY-MM-DD` |
| Enterprise users 28-day | `GET /enterprises/{enterprise}/copilot/metrics/reports/users-28-day/latest` |
| Enterprise users 1-day | `GET /enterprises/{enterprise}/copilot/metrics/reports/users-1-day?day=YYYY-MM-DD` |

## Retired Endpoints ❌

**NEVER reference these — they are shut down (as of April 2, 2026):**

| Retired endpoint | Replacement |
|-----------------|-------------|
| `/copilot/metrics` | Use `/copilot/metrics/reports/...` |
| `/copilot/usage-metrics` | Use `/copilot/metrics/reports/...` |
| `/copilot/usage` | Use `/copilot/metrics/reports/...` |

If documentation references any of these old paths, flag them as retired and substitute the correct `/copilot/metrics/reports/...` path.

## API Version

Always use the **most recent** `X-GitHub-Api-Version` listed at https://docs.github.com/rest/overview/api-versions. Do **not** hardcode a version. The API currently uses `2026-03-10` but this may advance — always verify from docs.

## Response Pattern: download_links + NDJSON

These endpoints do **not** return metrics inline. They return a `download_links` envelope:

```json
{
  "download_links": [
    { "url": "https://signed-s3-url.example.com/report.ndjson", "expires_at": "..." }
  ]
}
```

1. Call the GitHub API endpoint to get `download_links`
2. Fetch each URL with a plain HTTP GET (no GitHub auth headers needed — these are signed S3/CDN URLs)
3. Parse the response body as NDJSON: each line is a separate JSON object

## Authentication & Permissions

Check auth status before calling:
```bash
gh auth status
# If Copilot scope is missing:
gh auth refresh -h github.com -s copilot
```

### Required Permissions by Endpoint Type
| Endpoint Category | Minimum Role Required | How to Verify |
|---|---|---|
| Enterprise Copilot metrics (`/enterprises/*/copilot/*`) | **Enterprise Owner** | User must be an enterprise owner |
| Enterprise audit log (`/enterprises/*/audit-log`) | **Enterprise Owner** | Same as above |
| Organization-level APIs (`/orgs/*`) | **Organization Owner** or **Billing Manager** (varies) | `gh api /orgs/{org}/memberships/{username}` |
| Repository APIs (`/repos/*`) | **Read access** minimum; admin endpoints need **Admin** role | `gh api /repos/{owner}/{repo}` (if 404 → no access) |
| Code scanning / Dependabot / Secret scanning | **Security Manager** or **Admin** on the repo/org | Check org security settings |
| Copilot seat management | **Enterprise Owner** or **Org Owner** with Copilot admin | Check Copilot settings access |

### When an API Call Fails
- **401/403/404**: Do NOT retry. Diagnose the cause (auth expired, missing scope, insufficient role) and prescribe the fix (e.g., `gh auth refresh -s copilot`)
- **429**: Rate limit hit — wait a few minutes before retrying

## CLI Examples

**Always use `gh api` as the primary method** for querying GitHub API endpoints. Use `curl` only as a fallback when `gh` CLI is unavailable.

See [references/examples.md](references/examples.md) for `gh api` and `curl` command examples, including error handling.

## Metrics Included in Reports

Reports contain: acceptance rates, suggestions, active users, language breakdowns, editor breakdowns, seat usage, CLI-specific activity (daily active CLI users, request/session counts, token usage totals).

## Related GitHub API Endpoints

These endpoints are commonly used alongside Copilot metrics for reporting:

| Category | Endpoint | Documentation |
|----------|----------|---------------|
| Code scanning | `/repos/{owner}/{repo}/code-scanning/alerts` | [Code scanning docs](https://docs.github.com/rest/code-scanning) |
| Dependabot | `/repos/{owner}/{repo}/dependabot/alerts` | [Dependabot docs](https://docs.github.com/rest/dependabot) |
| Secret scanning | `/repos/{owner}/{repo}/secret-scanning/alerts` | [Secret scanning docs](https://docs.github.com/rest/secret-scanning) |
| Actions / CI/CD | `/repos/{owner}/{repo}/actions/runs` | [Actions docs](https://docs.github.com/rest/actions) |
| Pull requests | `/repos/{owner}/{repo}/pulls` | [Pulls docs](https://docs.github.com/en/rest/pulls) |
| Audit logs | `/enterprises/{enterprise}/audit-log` | [Orgs docs](https://docs.github.com/rest/orgs) |
| Traffic | `/repos/{owner}/{repo}/traffic/views` | [Metrics docs](https://docs.github.com/rest/metrics) |

## Documentation

- [GitHub Copilot REST API docs](https://docs.github.com/en/rest/copilot)
- [API versions reference](https://docs.github.com/rest/overview/api-versions)
- [Interpret Copilot metrics](https://docs.github.com/en/copilot/reference/copilot-usage-metrics/interpret-copilot-metrics)
