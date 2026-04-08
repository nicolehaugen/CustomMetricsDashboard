# DORA Metrics Dashboard — Testing Strategy

## Overview

Two test layers: **unit tests** for fast coding-agent feedback (no infrastructure) + **Playwright E2E** for full-stack CI validation (PG + Grafana containers). Lean approach — unit tests catch code bugs instantly, E2E tests prove the dashboard actually works.

---

## Test Layers

| Layer | Purpose | Who Runs It | Infrastructure | Tools |
|-------|---------|-------------|----------------|-------|
| **Unit** | Fast feedback after every code change | Coding agent locally + CI | None | Vitest + mocked Octokit |
| **E2E** | Full-stack validation — dashboard renders with real data | CI only (GitHub Actions) | PG + Grafana containers | Playwright |

---

## Layer 1: Unit Tests (Vitest)

Run with `npx vitest run` — no database, no containers. Coding agents should run this after every change.

### Config (`tests/config.test.ts`)
- Throws on missing `GITHUB_TOKEN`
- Throws on missing `PG_*` connection vars
- Returns valid config object when all vars present

### Fetchers (`tests/fetchers/*.test.ts`)
- Mock Octokit, verify correct API endpoint URL per fetcher
- Verify pagination params passed to `octokit.paginate()`
- Verify `since` parameter for incremental fetch
- Verify rate limit backoff on `X-RateLimit-Remaining: 0`
- `deployments.ts`: fetches both deployments AND statuses
- `copilot-users.ts`: iterates over a date range
- `pull-requests.ts`: requests `additions`, `deletions`, `labels`

### Seed Generator (`tests/seed-generator.test.ts`)
- Output shapes match DB schema column types
- Counts match config (users: 18, PRs: 120)
- Distributions within tolerance (~15% failures, ~12% rework, ~70% Copilot active)
- Timestamps relative to `Date.now()` within 90-day window
- Deployment SHAs match linked PRs' `merge_commit_sha`

### Bridge Resolver (`tests/bridge-resolver.test.ts`)
- Direct SHA match works
- Squash merge fallback works
- No match returns empty (doesn't error)

---

## Layer 2: E2E Tests (Playwright)

Run with `npx playwright test` — requires PG + Grafana service containers (CI only).

### Grafana Readiness (`e2e/helpers/wait-for-grafana.ts`)

Multi-layer wait to avoid flaky tests:
1. Grafana API health check (200 OK)
2. Datasource connectivity check
3. Dashboard panel-loading selector hidden

### Test Suite (`e2e/dashboard.spec.ts`)
- Dashboard loads without error panels
- Stat panels in Rows 1–2 show numeric values
- Template variable dropdowns work (`$environment`, `$copilot_cohort`) — no errors after filtering
- Time range selector changes results
- Detail tables in Row 8 have rows
- Empty state: date range with no data shows "No data" gracefully

---

## CI Pipeline (GitHub Actions)

```yaml
name: Tests
on: [push, pull_request]

jobs:
  unit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 18 }
      - run: npm ci
      - run: npx vitest run

  e2e:
    runs-on: ubuntu-latest
    needs: unit
    services:
      postgres:
        image: postgres:16-alpine
        env:
          POSTGRES_USER: test
          POSTGRES_PASSWORD: test
          POSTGRES_DB: dora_metrics_test
        ports: ["5432:5432"]
        options: --health-cmd pg_isready --health-interval 10s --health-timeout 5s --health-retries 5
      grafana:
        image: grafana/grafana:11.0.0
        env:
          GF_SECURITY_ADMIN_PASSWORD: admin
        ports: ["3000:3000"]
        options: >-
          --health-cmd "curl --fail http://localhost:3000/api/health || exit 1"
          --health-interval 10s --health-timeout 10s --health-retries 10
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 18 }
      - run: npm ci
      - run: npx playwright install --with-deps chromium
      - run: psql -h localhost -U test -d dora_metrics_test -f src/db/schema.sql
        env: { PGPASSWORD: test }
      - run: npm run seed
        env: { PG_HOST: localhost, PG_PORT: "5432", PG_USER: test, PG_PASSWORD: test, PG_DATABASE: dora_metrics_test }
      - name: Provision Grafana
        run: |
          curl -s -X POST http://admin:admin@localhost:3000/api/datasources \
            -H "Content-Type: application/json" \
            -d '{"name":"DORA PostgreSQL","type":"postgres","url":"localhost:5432","database":"dora_metrics_test","user":"test","secureJsonData":{"password":"test"},"jsonData":{"sslmode":"disable","postgresVersion":1500}}'
          curl -s -X POST http://admin:admin@localhost:3000/api/dashboards/db \
            -H "Content-Type: application/json" \
            -d "{\"dashboard\": $(cat grafana/dashboards/dora-metrics.json), \"overwrite\": true}"
      - run: npx playwright test
      - uses: actions/upload-artifact@v4
        if: failure()
        with:
          name: playwright-report
          path: playwright-report/
```

Pin Grafana image version (e.g., `11.0.0`) to prevent selector drift across upgrades.

---

## File Structure

```
vitest.config.ts
tests/
├── config.test.ts
├── fetchers/
│   ├── deployments.test.ts
│   ├── pull-requests.test.ts
│   ├── workflow-runs.test.ts
│   ├── issues.test.ts
│   ├── code-scanning.test.ts
│   └── copilot-users.test.ts
├── seed-generator.test.ts
└── bridge-resolver.test.ts
e2e/
├── playwright.config.ts
├── dashboard.spec.ts
└── helpers/
    └── wait-for-grafana.ts
.github/
└── workflows/
    └── test.yml
```
