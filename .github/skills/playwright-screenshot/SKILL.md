---
name: playwright-screenshot
description: "**SCREENSHOT SKILL** — Captures Grafana dashboard screenshots for PRs modifying dashboard JSON. Detects affected dashboards via git diff, screenshots each via Playwright MCP, commits PNGs to PR. WHEN: \"take dashboard screenshots\", \"screenshot affected dashboards\", \"capture before and after\", \"visual diff dashboards\", \"screenshot PR changes\". INVOKES: Playwright MCP, git. FOR SINGLE OPERATIONS: Use Playwright MCP directly for a specific dashboard URL."
---

# Playwright Dashboard Screenshot

Capture screenshots of Grafana dashboards affected by the current PR. Default: **after-only**. If user requests before-and-after, captures both states.

## Prerequisites

- Docker-compose stack running (`cd v2 && docker-compose up -d`)
- Grafana healthy at `http://localhost:3004`
- Database seeded (`npm run seed` from `v2/` if empty)

## MCP Tools Used

| Tool | Purpose |
|------|---------|
| `browser_navigate` | Open dashboard URL in Playwright browser |
| `browser_wait_for` | Wait for dashboard title / panel content |
| `browser_take_screenshot` | Capture PNG of rendered dashboard |
| `browser_snapshot` | Verify panels loaded before capture |

### CLI Fallback (when Playwright MCP is unavailable)

```bash
npx playwright screenshot "http://admin:admin@localhost:3004/d/<uid>?orgId=1&kiosk" v2/screenshots/after-<slug>.png
```

## Procedure

### 1. Detect affected dashboards

```bash
git diff --name-only origin/$(git symbolic-ref refs/remotes/origin/HEAD | sed 's|refs/remotes/origin/||')...HEAD -- 'v2/grafana/dashboards/*.json'
```

If no files match → report "No dashboards affected by this PR" and **stop**.

### 2. Map files to URLs

Extract `uid` from each file: `python3 -c "import json; print(json.load(open('<file>'))['uid'])"`

URL: `http://admin:admin@localhost:3004/d/<uid>?orgId=1&kiosk`
Slug: strip `.json` from filename (e.g., `00-overview`).

### 3. Screenshot mode

- **After-only (default):** Screenshot current post-change state.
- **Before-and-after:** User explicitly asks for "before and after" or "pre/post".

### 4. After-only flow

For each affected dashboard:
1. `browser_navigate` → dashboard URL
2. `browser_wait_for` → dashboard title, then wait 5s for panels
3. `browser_take_screenshot` → `v2/screenshots/after-<slug>.png`

### 5. Before-and-after flow

1. `git stash push -m "playwright-screenshot: temp stash"`
2. `docker-compose restart grafana` — wait for health
3. Take **before** screenshots → `v2/screenshots/before-<slug>.png`
4. `git stash pop`
5. `docker-compose restart grafana` — wait for health
6. Take **after** screenshots → `v2/screenshots/after-<slug>.png`

### 6. Commit

```bash
git add v2/screenshots/*.png
git commit -m "chore: add dashboard screenshots for visual review"
```

Push via `report_progress`.

## Error Handling

- **Grafana down:** Start docker-compose, wait 60s for health. Fail if timeout.
- **No data:** Still screenshot — layout is visible. Note in commit message.
- **No dashboard changes:** Report and exit without error.
