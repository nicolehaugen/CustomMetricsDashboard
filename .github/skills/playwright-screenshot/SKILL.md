---
name: playwright-screenshot
description: "**SCREENSHOT SKILL** — Captures Grafana dashboard screenshots for PRs that modify dashboard JSON. Detects affected dashboards via git diff, navigates to each via Playwright MCP, waits for panels to render, and commits PNG screenshots to the PR. Supports after-only (default) and before-and-after modes. WHEN: \"take dashboard screenshots\", \"screenshot affected dashboards\", \"capture before and after\", \"visual diff dashboards\", \"screenshot PR changes\", \"add dashboard screenshots to PR\". INVOKES: Playwright MCP browser tools, git diff, git commit. FOR SINGLE OPERATIONS: Use Playwright MCP directly to screenshot a specific dashboard URL."
---

# Playwright Dashboard Screenshot

Capture screenshots of Grafana dashboards affected by the current PR. By default, takes **after-change** screenshots only. If the user requests before-and-after, captures both states.

## 1. Detect affected dashboards

```bash
DEFAULT_BRANCH=$(git symbolic-ref refs/remotes/origin/HEAD 2>/dev/null | sed 's|refs/remotes/origin/||')
git diff --name-only origin/${DEFAULT_BRANCH}...HEAD -- 'v2/grafana/dashboards/*.json'
```

If no dashboard JSON files were modified, report "No dashboards affected by this PR — skipping screenshots" and **stop**.

## 2. Map files to dashboard URLs

For each modified dashboard file, extract the `uid` and `title`:

```bash
python3 -c "import json; d=json.load(open('<file>')); print(d['uid'], d.get('title',''))"
```

Build the Grafana URL: `http://admin:admin@localhost:3004/d/<uid>?orgId=1&kiosk`

Build a slug from the filename for screenshot naming (e.g., `00-overview.json` → `00-overview`).

## 3. Ensure Grafana is running

```bash
curl -sf http://localhost:3004/api/health || (cd v2 && docker-compose up -d && sleep 15)
```

If Grafana is not healthy after 60 seconds, report the error and stop.

If the database is empty (no seed data), run `npm run seed` from `v2/`.

## 4. Determine screenshot mode

- **After-only (default):** Take screenshots of the current post-change state.
- **Before-and-after:** If the user explicitly asks for "before and after", "before/after", or "pre/post" screenshots, use the before-and-after flow.

## 5. Take screenshots

### After-only mode (default)

For each affected dashboard:

1. Navigate to the dashboard URL: `browser_navigate` to `http://admin:admin@localhost:3004/d/<uid>?orgId=1&kiosk`
2. Wait for panels to load: `browser_wait_for` with the dashboard title text, then pause 5 seconds for panel data queries to resolve
3. Capture screenshot: `browser_take_screenshot` saving to `v2/screenshots/after-<slug>.png`

### Before-and-after mode

1. **Stash current changes:** `git stash push -m "playwright-screenshot: temp stash"`
2. **Restart Grafana** to pick up the pre-change dashboard JSON: `cd v2 && docker-compose restart grafana && sleep 10`
3. **Take before screenshots** of each affected dashboard → `v2/screenshots/before-<slug>.png`
4. **Restore changes:** `git stash pop`
5. **Restart Grafana** again to pick up the post-change JSON: `cd v2 && docker-compose restart grafana && sleep 10`
6. **Take after screenshots** of each affected dashboard → `v2/screenshots/after-<slug>.png`

## 6. Commit screenshots to the PR

```bash
mkdir -p v2/screenshots
git add v2/screenshots/*.png
git commit -m "chore: add dashboard screenshots for visual review"
```

Use `report_progress` to push the commit to the PR branch.

## Error Handling

- **Grafana not running:** Start docker-compose, wait for health endpoint. Fail after 60 seconds.
- **Dashboard shows "No data":** Still take the screenshot — layout is visible. Note in commit which dashboards had no data.
- **Panels still loading:** Wait up to 10 seconds after initial load. Use `browser_snapshot` to verify content before capturing.
- **Empty diff (no dashboard changes):** Report no affected dashboards and exit without error.
