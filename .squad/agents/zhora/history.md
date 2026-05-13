# Project Context

- **Owner:** Nicole Haugen
- **Project:** CustomMetricsDashboard — DORA + Copilot Metrics Learning Dashboard. Docker-based (PostgreSQL + Grafana + sync service) pulling from GitHub's metrics API.
- **Stack:** TypeScript, Express, Octokit, PostgreSQL 16, Grafana 11, Docker Compose, Playwright (E2E)
- **Created:** 2026-05-12

## Learnings

<!-- Append new learnings below. Each entry is something lasting about the project. -->
- Dashboard JSON files are now at `grafana/dashboards/` in the repo root (promoted from v3/). No need to target `v3/` anymore.
- 2026-05-12T20:01:50-05:00 — Dashboard cleanup complete. UIDs renamed (v3-overview → overview), [v3] prefixes removed from all titles, internal cross-links updated. One commit on chore/v3-root-promotion.
