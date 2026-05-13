# Project Context

- **Owner:** Nicole Haugen
- **Project:** CustomMetricsDashboard — DORA + Copilot Metrics Learning Dashboard. Docker-based (PostgreSQL + Grafana + sync service) pulling from GitHub's metrics API.
- **Stack:** TypeScript, Express, Octokit, PostgreSQL 16, Grafana 11, Docker Compose, Playwright (E2E)
- **Created:** 2026-05-12

## Learnings

<!-- Append new learnings below. Each entry is something lasting about the project. -->
- v3 dashboard E2E coverage should be a six-dashboard smoke suite that logs into Grafana and checks dashboard reachability, sane titles, and rendered panels without depending on seed data.
- 2026-05-12T20:01:50-05:00 — E2E test rewrite complete. Smoke suite finalized covering six dashboards, UID references updated (overview), seed dependency removed, tests passing on empty DB. One commit on chore/v3-root-promotion.
- 2026-05-13T02:18:00Z — CI workflow hardening complete. Playwright tests now run in CI mode (anonymous auth, no seed), docker-compose health detected, all 6 smoke tests passing. Plus Deckard's workflow fixes (test.yml heredoc, timeout, pre-checks, report upload).
