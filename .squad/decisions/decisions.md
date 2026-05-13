# Decisions Log

**Last Updated:** 2026-05-12T20:01:50Z

---

## copilot-directive-20260512T142857

### 2026-05-12T14:28:57Z: User directive
**By:** Nicole Haugen (via Copilot)
**What:** v3 is the final implementation. Remove all references to v2 (delete v2 folder). Remove all references to "v3" since it is now the root/only implementation. The folder structure should reflect v3 as the canonical version.
**Why:** User request — captured for team memory

---

## copilot-directive-20260512T143200

### 2026-05-12T14:28:57Z: User directives — v3 migration decisions
**By:** Nicole Haugen (via Copilot)
**What:**
- Lock Docker container names with `name: custom-metrics-dashboard` in docker-compose.yml
- Rename dashboard UID `v3-overview` → `overview`
- Skip seed data generator — not needed for now
- Existing tests are broken/outdated — simplify to test basics only, no seed data dependency, verify they pass
**Why:** User decisions for the v3 promotion migration — captured for team memory

---

## deckard-v3-migration-scope

# Decision: v3 Promotion — Scope Report
**Date:** 2026-05-12T14:28:57-05:00
**Author:** Deckard
**Requested by:** Nicole Haugen
**Status:** Proposed — pending team execution

### Context
Nicole has directed that v3 become the final, sole implementation. v2 is dead. The `v3/` folder prefix is an artifact — it should become the repo root. No more versioned subfolders.
This document is the authoritative scope report. Executors (Batty, Zhora, Pris) should treat this as their spec.

### 1. File/Folder Inventory

#### What gets deleted: `v2/` (entire folder)
- Full `v2/` tree including `.editorconfig`, `.env.example`, `Dockerfile`, `docker-compose.yml`, `grafana/`, `src/`, `tests/`, `seed/`, and all package artifacts.
- **Critical note:** v3 has **no seed generator** (`seed/` does not exist in v3).

#### What gets promoted: `v3/` → repo root
- All v3 contents move up: `src/`, `grafana/`, `docker-compose.yml`, `package.json`, `Dockerfile`, etc.
- **Notable absences vs v2:** No `seed/`, no `eslint.config.mjs`, no `vitest.config.ts` (v3 has only e2e Playwright).

### 2. References to Find and Update

#### Category A: GitHub Actions Workflows (BLOCKING)
- `.github/workflows/test.yml`
- `.github/workflows/playwright.yml`
- `.github/workflows/copilot-setup-steps.yml`
All must change from `working-directory: v2` → `.` or root-relative paths.

#### Category B: `.github/copilot-instructions.md` (BLOCKING)
- Complete rewrite needed: v2-oriented, must become root-oriented
- Port changes: 3003/3004 → 3005/3006
- DB name: dora_metrics → metrics
- No unit tests, no linting, no seed in v3
- Docker container names will change after promotion

#### Category C: `.github/agents/` (HIGH)
- `no-data-troubleshoot.agent.md` — update container names, ports, db name
- `sync-verifier.agent.md` — same updates

#### Category D: `.github/skills/` (MEDIUM)
- `drift-to-metric-plan/SKILL.md`
- `schema-drift-apply/SKILL.md`
- `playwright-screenshots/SKILL.md`
- `setup-env/SKILL.md`
All must remove `v3` path segments, update container names.

#### Category E: `scripts/add-weekly-and-cloud-agent-panels.mjs` (BLOCKING)
- Line 12 hardcodes `v3/grafana/dashboards` — must change to root `grafana/dashboards`

#### Category F: Inside v3/ (on promotion)
- `package.json`: rename `custom-metrics-dashboard-v3` → `custom-metrics-dashboard`
- `README.md`: remove "# v3:", update instructions, container names
- `src/db/schema.sql`: update schema comment
- `src/server.ts`: update `OVERVIEW_URL` for new UID
- `grafana/dashboards/01-overview.json`: change UID from `v3-overview` → `overview`, remove `[v3]` titles
- All dashboard JSON: remove `[v3]` prefixes
- `tests/e2e/dashboards.spec.ts`: update UID references

#### Category G: Squad files (LOW)
- `.squad/team.md` — remove "v3/" reference
- All agent `.squad/agents/*/history.md` files — remove "v3/" reference

### 3. Structural Decision
Promote v3/ contents **directly to repo root**. No intermediate named folder. Merge `scripts/` folders (v3/scripts + root scripts into single root).

### 4. Migration Risks
- **Docker volume orphaning**: v3 volumes orphaned after promotion; acceptable for local tool
- **Container names unpredictable**: Use `name: custom-metrics-dashboard` in docker-compose.yml to lock names
- **Port changes**: 3003/3004 → 3005/3006 across all agent/skill files
- **DB name change**: dora_metrics → metrics
- **No unit tests in v3**: test.yml must be rewritten; npm lint/vitest removed
- **Dashboard UID changes**: v3-overview → overview affects cross-dashboard links

### 5. Execution Order
1. Validate v3 first (Pris)
2. Delete v2/ (Batty)
3. Promote v3/ to root (Batty)
4. Update self-references in promoted files (Batty + Zhora)
5. Update GitHub Actions (Batty)
6. Rewrite copilot-instructions.md (Rachael + Deckard review)
7. Update Agent and Skill files (Rachael)
8. Update Squad files (Scribe)
9. Update root scripts (Batty)
10. Smoke test (Pris)

---

## pris-test-simplification

# Pris Test Simplification

## Decision
Keep the v3 Playwright dashboard suite as a smoke test only: cover the six shipped dashboards, use the `overview` UID, require Grafana login, and assert only successful loads, non-error titles, and visible panels.

## Rationale
The dashboard stack does not require seeded data to be healthy, so the E2E suite should validate routing and rendering against an empty database instead of asserting specific panel content.
