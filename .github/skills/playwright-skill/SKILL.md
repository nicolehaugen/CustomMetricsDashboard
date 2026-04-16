---
name: Playwright-Screenshot
description: "**WORKFLOW SKILL** — Captures Playwright screenshots of Grafana dashboards affected by PR changes. Detects modified dashboard JSON, maps to Grafana URLs, captures loaded panels. Default: after-change only; before-and-after when requested. WHEN: \"take dashboard screenshots\", \"screenshot affected dashboards\", \"capture before and after\", \"screenshot PR changes\", \"grafana screenshots\". INVOKES: git diff, Playwright, git commit. FOR SINGLE OPERATIONS: Use `npx playwright screenshot` directly."
---

# Playwright Dashboard Screenshots

## 1. Detect affected dashboards

```bash
git diff --name-only origin/<default>..HEAD -- 'v2/grafana/dashboards/*.json'
```

If empty, report "No dashboards affected" and **stop**.

## 2. Map file → Grafana URL

Extract UID: `python3 -c "import json; print(json.load(open('<file>'))['uid'])"`

URL: `http://admin:admin@localhost:3004/d/<uid>?orgId=1&kiosk`

## 3. Before/after mode

- **Default:** After-only screenshots.
- **Before-and-after:** Only when user explicitly requests. Take before screenshot first, apply changes, then after.

## 4. Take screenshots

```bash
npx playwright screenshot --wait-for-timeout=5000 \
  "http://admin:admin@localhost:3004/d/<uid>?orgId=1&kiosk" \
  v2/screenshots/<prefix>-<uid>.png
```

Prefix: `after` (default) or `before`/`after`.

## 5. Commit

```bash
git add v2/screenshots/*.png
git commit -m "chore: add dashboard screenshots for visual review"
```

## Errors

- **Grafana down:** `docker compose up -d` from `v2/`.
- **Blank screenshots:** Increase timeout or seed database.
- **Loading panels:** Scroll dashboard first, then re-screenshot.
