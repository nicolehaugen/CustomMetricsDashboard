---
name: playwright-screenshots
description: "**WORKFLOW SKILL** — Capture before/after Grafana dashboard screenshots when JSON, SQL, or seed data changes. Saves PNGs to screenshots/ for PR visual review. WHEN: \"take dashboard screenshots\", \"capture before and after\", \"screenshot dashboard changes\", \"visual diff dashboards\", \"commit dashboard screenshots\". INVOKES: Playwright MCP, git. FOR SINGLE OPERATIONS: Use Playwright MCP directly."
---

# Playwright Dashboard Screenshots

Capture before/after screenshots of Grafana dashboards and commit them to the PR.

## Prerequisites

Docker-compose stack running with seeded data:

```bash
docker-compose up -d && npm run seed
```

## Procedure

### 1. Identify affected dashboards

Use `git diff --name-only` to find changed files under `grafana/dashboards/`. If seed data or schema changed, treat all dashboards as affected. Dashboard UIDs are in each JSON file's `"uid"` field.

### 2. Capture "before" screenshots

For each affected dashboard, navigate to `http://admin:admin@localhost:3004/d/<uid>?orgId=1&kiosk`. Use `waitForLoadState('load')` + `waitForTimeout(3000)` — **never** `networkidle` (Grafana WebSocket blocks it). Scroll the full page, then save to `screenshots/before-<uid>.png`.

### 3. Apply changes

Edit dashboard JSON, SQL, or seed data. Grafana auto-provisions on reload.

### 4. Capture "after" screenshots

Repeat step 2, saving to `screenshots/after-<uid>.png`.

### 5. Commit and summarize

```bash
git add screenshots/{before,after}-*.png
git commit -m "docs: add before/after dashboard screenshots"
```

Use `report_progress` to push. Update the PR description with before/after pairs.

## Error Handling

- **Grafana not running**: Start the stack with `docker-compose up -d`
- **Empty panels**: Run `npm run seed`; verify `postgres-1` is healthy
- **Missing directory**: Create `screenshots/` before saving
