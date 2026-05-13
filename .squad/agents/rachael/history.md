# Project Context

- **Owner:** Nicole Haugen
- **Project:** CustomMetricsDashboard — DORA + Copilot Metrics Learning Dashboard. Docker-based (PostgreSQL + Grafana + sync service) pulling from GitHub's metrics API.
- **Stack:** TypeScript, Express, Octokit, PostgreSQL 16, Grafana 11, Docker Compose, Playwright (E2E)
- **Created:** 2026-05-12

## Learnings

<!-- Append new learnings below. Each entry is something lasting about the project. -->

### 2026-05-12T14:28:57-05:00 — Documentation Migration Complete

All documentation updated to reflect promotion from v3/ to repo root:
- `.github/copilot-instructions.md` — rewritten with new ports (3005, 3006), container names, database name, and removed v2-specific features (vitest, ESLint, seed generator).
- `.github/agents/no-data-troubleshoot.agent.md` — updated container names, removed seed step, updated port references, database name.
- `.github/agents/sync-verifier.agent.md` — updated container names, ports, database name.
- All skill files updated: `drift-to-metric-plan`, `schema-drift-apply`, `playwright-screenshots`, `setup-env` — removed v3/ and v2/ path prefixes.
- Team history files updated: removed "Active version is v3/" references in all `.squad/agents/*/history.md` files.
- Deckard's migration scope learning updated to reflect completion.
