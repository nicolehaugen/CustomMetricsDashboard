# Copilot Metrics API — CLI Examples

## Example `gh api` Commands

```bash
# Get the org 28-day report (replace VERSION with latest from docs)
gh api \
  -H "Accept: application/vnd.github+json" \
  -H "X-GitHub-Api-Version: VERSION" \
  "/orgs/YOUR_ORG/copilot/metrics/reports/organization-28-day/latest"

# Get the org users 28-day report
gh api \
  -H "Accept: application/vnd.github+json" \
  -H "X-GitHub-Api-Version: VERSION" \
  "/orgs/YOUR_ORG/copilot/metrics/reports/users-28-day/latest"

# Get a specific day's org snapshot (e.g., April 1, 2026)
gh api \
  -H "Accept: application/vnd.github+json" \
  -H "X-GitHub-Api-Version: VERSION" \
  "/orgs/YOUR_ORG/copilot/metrics/reports/organization-1-day?day=2026-04-01"

# Fetch the NDJSON report from a download_link URL (no GitHub auth header needed)
curl -s "SIGNED_URL_FROM_DOWNLOAD_LINKS" | while IFS= read -r line; do echo "$line" | jq .; done
```

## Example `curl` Commands

Use these when `gh` CLI is not available or you prefer raw REST calls. Set your token in `GITHUB_TOKEN` first:

```bash
export GITHUB_TOKEN="ghp_your_token_here"
export GITHUB_ORG="your-org"
export API_VERSION="VERSION"   # replace with latest from docs
```

### Step 1 — Get the download_links envelope

```bash
# Org 28-day summary
curl -s \
  -H "Accept: application/vnd.github+json" \
  -H "Authorization: Bearer $GITHUB_TOKEN" \
  -H "X-GitHub-Api-Version: $API_VERSION" \
  "https://api.github.com/orgs/$GITHUB_ORG/copilot/metrics/reports/organization-28-day/latest"

# Org users 28-day
curl -s \
  -H "Accept: application/vnd.github+json" \
  -H "Authorization: Bearer $GITHUB_TOKEN" \
  -H "X-GitHub-Api-Version: $API_VERSION" \
  "https://api.github.com/orgs/$GITHUB_ORG/copilot/metrics/reports/users-28-day/latest"

# Org 1-day snapshot
curl -s \
  -H "Accept: application/vnd.github+json" \
  -H "Authorization: Bearer $GITHUB_TOKEN" \
  -H "X-GitHub-Api-Version: $API_VERSION" \
  "https://api.github.com/orgs/$GITHUB_ORG/copilot/metrics/reports/organization-1-day?day=2026-04-01"

# Enterprise 28-day summary
curl -s \
  -H "Accept: application/vnd.github+json" \
  -H "Authorization: Bearer $GITHUB_TOKEN" \
  -H "X-GitHub-Api-Version: $API_VERSION" \
  "https://api.github.com/enterprises/YOUR_ENTERPRISE/copilot/metrics/reports/enterprise-28-day/latest"
```

### Step 2 — Fetch the NDJSON report

The response from Step 1 contains a `download_links` array. Extract a URL and fetch it **without** the GitHub auth headers (these are pre-signed S3/CDN URLs):

```bash
# Extract the first download URL and fetch the NDJSON report
DOWNLOAD_URL=$(curl -s \
  -H "Accept: application/vnd.github+json" \
  -H "Authorization: Bearer $GITHUB_TOKEN" \
  -H "X-GitHub-Api-Version: $API_VERSION" \
  "https://api.github.com/orgs/$GITHUB_ORG/copilot/metrics/reports/organization-28-day/latest" \
  | jq -r '.download_links[0].url')

curl -s "$DOWNLOAD_URL" | while IFS= read -r line; do echo "$line" | jq .; done
```

### One-liner: fetch and pretty-print all records

```bash
curl -s \
  -H "Accept: application/vnd.github+json" \
  -H "Authorization: Bearer $GITHUB_TOKEN" \
  -H "X-GitHub-Api-Version: $API_VERSION" \
  "https://api.github.com/orgs/$GITHUB_ORG/copilot/metrics/reports/organization-28-day/latest" \
  | jq -r '.download_links[].url' \
  | xargs -I{} curl -s "{}" \
  | jq -s '.'
```

### Error responses to handle

| HTTP Status | Likely cause | Fix |
|-------------|-------------|-----|
| `401 Unauthorized` | Token missing or expired | Re-export `GITHUB_TOKEN` or run `gh auth refresh` |
| `403 Forbidden` | Insufficient role | Ensure you are Org Owner / Enterprise Owner with Copilot admin |
| `404 Not Found` | Wrong endpoint path or no Copilot data yet | Double-check the endpoint URL; data may not exist for that day |
| `429 Too Many Requests` | Rate limit hit | Wait a few minutes; do not retry immediately |
