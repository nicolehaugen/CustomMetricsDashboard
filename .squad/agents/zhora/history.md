# Project Context

- **Owner:** Nicole Haugen
- **Project:** CustomMetricsDashboard — DORA + Copilot Metrics Learning Dashboard. Docker-based (PostgreSQL + Grafana + sync service) pulling from GitHub's metrics API.
- **Stack:** TypeScript, Express, Octokit, PostgreSQL 16, Grafana 11, Docker Compose, Playwright (E2E)
- **Created:** 2026-05-12

## Learnings

<!-- Append new learnings below. Each entry is something lasting about the project. -->
- Dashboard JSON files are now at `grafana/dashboards/` in the repo root (promoted from v3/). No need to target `v3/` anymore.
- 2026-05-12T20:01:50-05:00 — Dashboard cleanup complete. UIDs renamed (v3-overview → overview), [v3] prefixes removed from all titles, internal cross-links updated. One commit on chore/v3-root-promotion.
- 2026-05-12T20:35:12.467-05:00 — The live per-user dashboard for the Docker stack on ports 5433/3005/3006 is `v3/grafana/dashboards/09-per-user-copilot.json`; its User variable reads from `copilot_user_daily`, and the dropdown stays empty when that table is unpopulated.
- 2026-05-12T20:35:12.467-05:00 — In the live v3 stack, `copilot_seats` and `copilot_organization_daily` can load while `copilot_user_daily` remains empty because the sync logs show `Copilot user metrics skipped: 404`; investigate `v3/src/github/copilot-user-metrics.ts` and its enterprise-scoped endpoint first.
