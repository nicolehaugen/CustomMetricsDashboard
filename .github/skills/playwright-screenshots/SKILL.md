---
name: playwright-screenshots
description: "**WORKFLOW SKILL** — Capture before/after Grafana dashboard screenshots when JSON or SQL changes, upload them via the Copilot coding agent's native image-attachment capability, and embed them in the PR description as `## Visual verification`. WHEN: \"take dashboard screenshots\", \"capture before and after\", \"screenshot dashboard changes\", \"visual diff dashboards\", \"embed screenshots in PR\". INVOKES: Playwright MCP, gh pr edit. FOR SINGLE OPERATIONS: Use Playwright MCP directly."
---

# Playwright Dashboard Screenshots

Capture before/after screenshots of Grafana dashboards and **embed them in the PR description** using `github.com/user-attachments/assets/<uuid>` URLs. **Do not commit PNGs to the repository** — this contradicts `.github/copilot-instructions.md`.

## Prerequisites

Docker-compose stack running:

```bash
docker-compose up -d
```

## Procedure

### 1. Identify affected dashboards

Use `git diff --name-only` to find changed files under `grafana/dashboards/`. Dashboard UIDs are in each JSON file's `"uid"` field.

### 2. Capture "before" screenshots

For each affected dashboard, navigate to `http://admin:admin@localhost:3006/d/<uid>?orgId=1&kiosk`. Use `waitForLoadState('load')` + `waitForTimeout(3000)` — **never** `networkidle` (Grafana WebSocket blocks it). Scroll the full page, then capture the screenshot. Save only to a temporary path (e.g. `/tmp/before-<uid>.png`) — this file is for capture, not for the repo.

### 3. Apply changes

Edit dashboard JSON or SQL. Grafana auto-provisions on reload.

### 4. Capture "after" screenshots

Repeat step 2, saving to `/tmp/after-<uid>.png`.

### 5. Upload and embed in the PR body

Use the cloud agent's native image-attachment capability to upload each PNG. Each upload returns a `https://github.com/user-attachments/assets/<uuid>` URL — the same form humans get when they paste an image into the GitHub web UI.

Then update the PR body to include a `## Visual verification` section:

```markdown
## Visual verification

**Before:**

![<dashboard> — before](https://github.com/user-attachments/assets/<uuid>)

**After:**

![<dashboard> — after](https://github.com/user-attachments/assets/<uuid>)
```

Edit the PR body via `gh pr edit <n> --body-file body.md` (or the equivalent agent tool).

### 6. Verify each URL returns HTTP 200

```bash
curl -fsI "https://github.com/user-attachments/assets/<uuid>"
```

If any URL fails, the upload did not complete — retry the upload. **Do not** invent a URL, do not substitute `raw.githubusercontent.com`, do not fall back to committing the file.

## Hard rules

- **Do not** run `git add screenshots/`, `git add docs/screenshots/`, or commit any `.png` to the repo. There is no "screenshots/" folder.
- **Do not** hand-construct image URLs (`raw.githubusercontent.com/.../<sha>/<path>`, `github.com/<owner>/<repo>/blob/...`, etc.). The only valid URL form is `https://github.com/user-attachments/assets/<uuid>` returned by an actual upload.
- **Do not** write the heading `## Visual verification` unless it is immediately followed by `![](...)` lines whose URLs each return HTTP 200. No placeholder prose ("Embedded above", "See attached", "Screenshots saved at `/tmp/...`").
- If upload is genuinely unavailable in this session, omit the screenshots entirely and say so plainly in the PR body (e.g. "Screenshot upload unavailable in this session — Playwright captures saved at `/tmp/<name>.png`"). Do not fake it.

## Error Handling

- **Grafana not running**: Start the stack with `docker-compose up -d` from repo root.
- **Empty panels**: Verify data exists in the database with the `sync-verifier` agent.
- **Upload fails or unavailable**: Follow the "If upload is genuinely unavailable" rule above. Never substitute a committed file.
