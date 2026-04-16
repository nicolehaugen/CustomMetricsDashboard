---
name: Playwright-Screenshot-Skill
description: "**WORKFLOW SKILL** — Capture Grafana dashboard screenshots for PRs modifying dashboard JSON. Detects affected dashboards via git diff, navigates Playwright MCP to each URL, waits for load, commits screenshots. WHEN: \"take dashboard screenshots\", \"screenshot affected dashboards\", \"before and after screenshots\". INVOKES: git diff, Playwright MCP, report_progress. FOR SINGLE OPERATIONS: Use Playwright MCP directly for a known URL."
---

# Playwright Dashboard Screenshot Skill

Capture Grafana dashboard screenshots for pull requests that modify dashboard JSON files under `v2/grafana/dashboards/`.

## When to Use

- User modifies one or more Grafana dashboard JSON files and wants visual proof of the changes
- User asks for screenshots of affected dashboards in a PR
- User requests before-and-after comparison screenshots of dashboard changes
- Reviewing dashboard changes and needing visual confirmation that panels render correctly

## Prerequisites

- Docker-compose stack running (`docker compose up -d` from `v2/`)
- Database seeded (`npm run seed` from `v2/` if empty)
- Grafana accessible at `http://localhost:3004`
- Playwright MCP browser tools available

## Procedure

### 1. Identify Affected Dashboards

Determine which dashboard JSON files were modified in the current PR or working tree:

```bash
# Check git diff for modified dashboard files
git diff --name-only origin/master...HEAD -- v2/grafana/dashboards/
```

If no dashboard JSON files are in the diff, inform the user that no dashboards were affected and skip screenshot capture.

For each affected file, extract the dashboard UID:

```bash
python3 -c "import json; d=json.load(open('<path>')); print(d['uid'])"
```

### 2. Determine Screenshot Mode

- **Default (after-only):** If the user does NOT mention "before", "before and after", or "comparison", take only post-change screenshots.
- **Before-and-after:** If the user explicitly requests before/after or comparison screenshots, take screenshots BEFORE applying changes, then AFTER.

### 3. Take Before Screenshots (only if before-and-after mode)

If before-and-after mode, BEFORE the dashboard JSON changes are applied:

1. Navigate to `http://localhost:3004/d/<uid>?orgId=1&kiosk`
2. Wait 5 seconds for panels to fully load
3. Verify panels are loaded (page snapshot should show data values, not "Loading" or "Fetching")
4. Take screenshot and save as `v2/screenshots/before-<dashboard-slug>.png`

### 4. Apply Changes (only if before-and-after mode)

If taking before-and-after screenshots, apply the dashboard changes now. If Grafana auto-provisions from JSON files, restart Grafana to pick up changes:

```bash
docker compose restart grafana
```

Wait for Grafana to be healthy before proceeding.

### 5. Take After Screenshots

For each affected dashboard:

1. Navigate to `http://localhost:3004/d/<uid>?orgId=1&kiosk`
2. Wait 5 seconds for panels to fully load
3. Verify panels are loaded (page snapshot should show data values, not "Loading" or "Fetching")
4. Take screenshot and save as `v2/screenshots/after-<dashboard-slug>.png`

### 6. Commit Screenshots

Commit the screenshots to the PR using `report_progress` or `git add` + `git commit`:

```bash
git add v2/screenshots/
git commit -m "Add dashboard screenshots for <list of affected dashboards>"
```

## Dashboard UID Reference

| File | UID | Slug |
|------|-----|------|
| 00-overview.json | overview | overview |
| 01-deployment-frequency.json | deploy-freq | deployment-frequency |
| 02-lead-time.json | lead-time | lead-time |
| 03-change-failure-rate.json | change-fail | change-failure-rate |
| 04-mean-time-to-recovery.json | mttr | mean-time-to-recovery |
| 05-copilot-adoption.json | copilot-adopt | copilot-adoption |
| 06-copilot-code-impact.json | copilot-impact | copilot-code-impact |
| 07-dora-vs-copilot.json | dora-copilot | dora-vs-copilot |

## Naming Convention

- After-only: `v2/screenshots/after-<dashboard-slug>.png`
- Before: `v2/screenshots/before-<dashboard-slug>.png`
- After (in before-and-after mode): `v2/screenshots/after-<dashboard-slug>.png`

## Error Handling

- **Grafana not running:** Run `docker compose up -d` from `v2/` first
- **Panels show "Loading":** Increase wait time or check that the database is seeded
- **No data banner:** Verify seed data is loaded (`npm run seed` from `v2/`)
- **Screenshot path blocked:** Save to `v2/screenshots/` which is in the project directory
