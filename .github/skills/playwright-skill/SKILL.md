---
name: playwright-skill
description: "**SCREENSHOT SKILL** — Capture Grafana dashboard screenshots for PRs modifying dashboard JSON. Detects affected dashboards via git diff, screenshots them at localhost:3004, commits PNGs to v2/screenshots/. WHEN: \"take dashboard screenshots\", \"screenshot affected dashboards\", \"capture before and after\", \"PR dashboard preview\", \"visual diff\". INVOKES: Playwright MCP, git diff. FOR SINGLE OPERATIONS: Use Playwright MCP directly for a specific dashboard URL."
---

# Playwright Dashboard Screenshot Skill

Capture Grafana dashboard screenshots for PRs modifying `v2/grafana/dashboards/*.json`. Commits PNGs to `v2/screenshots/` for visual review.

## Procedure

### 1. Detect Affected Dashboards

```bash
git diff --name-only origin/<default>..HEAD -- v2/grafana/dashboards/*.json
```

If none found, report "No dashboard changes detected" and stop.

### 2. Build Dashboard URLs

For each file, extract `uid` and build: `http://admin:admin@localhost:3004/d/<uid>?orgId=1&kiosk`

### 3. Screenshot Mode

- **Default (after-only):** Screenshot current state only.
- **Before-and-after:** If user requests, stash → screenshot "before" → restore → screenshot "after".

### 4. Ensure Grafana Is Running

```bash
curl -sf http://localhost:3004/api/health || (cd v2 && docker-compose up -d && sleep 10)
```

### 5. Take Screenshots

Navigate to each URL via Playwright MCP, wait for load + 3s delay (avoid `networkidle`), capture full page. Save as `after-<slug>.png` or `before-<slug>.png` / `after-<slug>.png`.

### 6. Commit to PR

```bash
git add -f v2/screenshots/*.png
git commit -m "chore: add dashboard screenshots for visual review"
```

## Error Handling

- **Grafana not running:** Start docker-compose, retry
- **Empty panels:** Run `npm run seed` from `v2/`
- **No Playwright MCP:** Fallback: `npx playwright screenshot "<url>" <path>`
