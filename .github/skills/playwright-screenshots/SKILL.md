---
name: playwright-screenshots
description: "**WORKFLOW SKILL** — Capture before/after Grafana dashboard screenshots when JSON, SQL, or seed data changes. Saves PNGs to v2/screenshots/ and commits them to the current PR for visual review. WHEN: \"take dashboard screenshots\", \"capture before and after\", \"screenshot dashboard changes\", \"visual diff dashboards\", \"commit dashboard screenshots\"."
---

# Playwright Dashboard Screenshots

Capture before/after screenshots of Grafana dashboards affected by the current change set and commit them to the PR for visual review.

## When to Use

- Dashboard JSON files changed (`v2/grafana/dashboards/*.json`)
- Grafana SQL queries modified inside dashboard panels
- Seed data or schema changes that affect rendered panels
- User requests visual confirmation of dashboard changes

## Prerequisites

The docker-compose stack must be running with seeded data:

```bash
cd v2
docker-compose up -d          # add --build if TypeScript source files changed
npm run seed                   # only if database is empty
```

Grafana is available at `http://localhost:3004` (admin/admin).

## Dashboard Catalog

| File | UID | Kiosk URL |
|------|-----|-----------|
| 00-overview.json | `overview` | `/d/overview?orgId=1&kiosk` |
| 01-deployment-frequency.json | `deploy-freq` | `/d/deploy-freq?orgId=1&kiosk` |
| 02-lead-time.json | `lead-time` | `/d/lead-time?orgId=1&kiosk` |
| 03-change-failure-rate.json | `change-fail` | `/d/change-fail?orgId=1&kiosk` |
| 04-mean-time-to-recovery.json | `mttr` | `/d/mttr?orgId=1&kiosk` |
| 05-copilot-adoption.json | `copilot-adopt` | `/d/copilot-adopt?orgId=1&kiosk` |
| 06-copilot-code-impact.json | `copilot-impact` | `/d/copilot-impact?orgId=1&kiosk` |
| 07-dora-vs-copilot.json | `dora-copilot` | `/d/dora-copilot?orgId=1&kiosk` |

## Procedure

### 1. Identify affected dashboards

Run `git diff --name-only` against the base branch to find changed files under `v2/grafana/dashboards/`. If seed data or schema files changed, treat **all** dashboards as affected.

### 2. Capture "before" screenshots

Before applying dashboard changes, for each affected dashboard:

1. Navigate to `http://admin:admin@localhost:3004/d/<uid>?orgId=1&kiosk`
2. Wait for panels: use `waitForLoadState('load')` + `waitForTimeout(3000)` — do **not** use `waitForLoadState('networkidle')` (Grafana's WebSocket keeps it from resolving)
3. Scroll through the full page to trigger below-the-fold panel rendering
4. Save screenshot to `v2/screenshots/before-<uid>.png`

Using Playwright MCP (cloud agent):

```
navigate to http://admin:admin@localhost:3004/d/<uid>?orgId=1&kiosk
wait for load
take screenshot → v2/screenshots/before-<uid>.png
```

Using Playwright CLI (local agent):

```bash
npx playwright screenshot \
  "http://admin:admin@localhost:3004/d/<uid>?orgId=1&kiosk" \
  v2/screenshots/before-<uid>.png
```

### 3. Apply changes

Make the dashboard JSON, SQL, or seed data edits. If Grafana auto-provisions dashboards, changes take effect on the next page load.

### 4. Capture "after" screenshots

Repeat step 2 for each affected dashboard, saving to `v2/screenshots/after-<uid>.png`.

### 5. Commit screenshots to the PR

```bash
git add v2/screenshots/before-*.png v2/screenshots/after-*.png
git commit -m "docs: add before/after dashboard screenshots"
```

Use `report_progress` in cloud agent mode to push.

### 6. Summarize changes

Post a comment or update the PR description listing each dashboard with its before/after screenshot pair so reviewers can visually compare.

## Grafana Selector Notes

- Table cells render as `role="cell"` (not `role="gridcell"`)
- Use `[role="row"]:has([role="cell"])` for data row selectors
- Panels use `[data-panelid]` attributes
- Do **not** use `waitForLoadState('networkidle')` — the WebSocket prevents resolution

## Error Handling

- **Grafana not running**: Prompt the user to start the docker-compose stack
- **Empty panels / "No data"**: Check if `npm run seed` has been run; verify `v2-postgres-1` is healthy
- **Screenshot directory missing**: Create `v2/screenshots/` before saving
