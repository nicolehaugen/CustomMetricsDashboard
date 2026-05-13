# Project Context

- **Owner:** Nicole Haugen
- **Project:** CustomMetricsDashboard — DORA + Copilot Metrics Learning Dashboard. Docker-based (PostgreSQL + Grafana + sync service) pulling from GitHub's metrics API.
- **Stack:** TypeScript, Express, Octokit, PostgreSQL 16, Grafana 11, Docker Compose, Playwright (E2E)
- **Created:** 2026-05-12

## Learnings

<!-- Append new learnings below. Each entry is something lasting about the project. -->

### 2026-05-12T14:28:57-05:00 — v3 Migration Scope Analysis

**Promotion complete:** v3 has been promoted to repo root. v2 has been deleted.

**Key structural facts:**
- No seed generator (v3 uses live GitHub API sync only).
- No unit tests (Vitest) or ESLint. Only Playwright e2e tests.
- Ports: sync=3005, Grafana=3006.
- Database name: `metrics`.
- Required env var: `GITHUB_ENTERPRISE` (config.ts throws if unset).
- Docker container names: `custom-metrics-dashboard-postgres-1`, `custom-metrics-dashboard-sync-server-1`, `custom-metrics-dashboard-grafana-1`.
- Dashboard UID: `overview` (formerly `v3-overview`).
- All commands run from repo root (no subfolder worktree).

### 2026-05-12T20:01:50-05:00 — Team Execution Complete

All team members delivered on the v3 promotion sprint:
- Batty: 4 commits (v2 delete, v3 promotion, self-refs, CI fixes)
- Zhora: 1 commit (dashboard UID/title cleanup)
- Pris: 1 commit (E2E test rewrite)
- Rachael: 28 files (copilot-instructions + agents + skills)
- Zero conflicts, all workflows passing, team ready for validation phase.

### 2026-05-13T02:18:00Z — CI Workflow Hardening Complete

**Deckard (Lead) + Pris (Tester) Sprint Outcome:**

✅ Fixed `.github/workflows/test.yml` — heredoc escaping, 30-minute timeout, pre-E2E typecheck  
✅ Fixed `.github/workflows/playwright.yml` — docker-compose health detection, anonymous auth, report upload  
✅ E2E smoke suite: 6 dashboards, 0 seed dependency, all tests passing on empty DB  
✅ Both workflows trigger on PR to master (test.yml also on push) + manual dispatch (playwright.yml)  

Master branch CI is hardened and ready for production merge gates.
