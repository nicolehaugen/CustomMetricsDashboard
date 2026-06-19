---
name: refresh-demo-env
description: "**WORKFLOW SKILL** — Reconfigure the CustomMetricsDashboard to point at the user's current octodemo/bootstrap demo environment, triggering a fresh data sync. WHEN: 'refresh demo env', 'dashboard data is stale', 'update demo environment', 'point dashboard at my demo', 'new demo was provisioned', 'weekly demo refresh'. INVOKES: gh CLI for bootstrap issue discovery, scripts/use-demo.sh or scripts/create-demo.sh, docker compose, sync server. FOR SINGLE OPERATIONS: run bash scripts/use-demo.sh directly if a demo::provisioned issue already exists."
---

# Refresh Demo Environment

Reconfigure the CustomMetricsDashboard's `.env` to point at the user's current
`octodemo/bootstrap`-provisioned demo, then trigger a fresh data sync so
Grafana reflects the new environment.

## Background

Demo environments in `octodemo/bootstrap` are ephemeral — they are torn down
weekly by an expiry workflow. After each teardown the user must create a new
one (via `octodemo/bootstrap` issue) and reconfigure the dashboard. This
skill automates that entire workflow.

The dashboard reads `GITHUB_ORG` and `GITHUB_REPO` from `.env` at container
start. Changing those two values + restarting the sync-server container + POST
`/sync` is all it takes to point every dashboard panel at a new environment.
`GITHUB_ENTERPRISE` is **not** updated — it stays constant across all demos.

## Step 1 — Pre-checks

Before running any scripts, verify:

1. **Docker Desktop is running:**
   ```bash
   docker info
   ```
   If not, ask the user to start it.

2. **Working directory is the repo root:**
   Scripts must run from `C:\Repos\CustomMetricsDashboard` (or wherever the
   repo is checked out). Both scripts resolve their own path, so `cd` is only
   needed for `docker compose`.

3. **`.env` exists:**
   ```bash
   ls .env
   ```
   If missing, invoke the `setup-env` skill first.

## Step 2 — Decide: use existing demo or create a new one?

Run this single API call to check for an active provisioned demo:

```bash
COUNT=$(gh api -X GET /repos/octodemo/bootstrap/issues \
  -f labels=demo::provisioned \
  -f state=open \
  -f creator="$(gh api /user --jq .login)" \
  --jq length)
echo "Active demos: $COUNT"
```

Determine demo age if `$COUNT >= 1`:
```bash
UPDATED=$(gh api -X GET /repos/octodemo/bootstrap/issues \
  -f labels=demo::provisioned -f state=open \
  -f creator="$(gh api /user --jq .login)" \
  -f per_page=1 -f sort=updated -f direction=desc \
  --jq '.[0].updated_at')
echo "Demo last updated: $UPDATED"
```

**Decision tree:**

| Condition | Action |
|-----------|--------|
| `$COUNT >= 1` AND demo updated < 6 days ago | Run `use-demo.sh` — just reconfigure |
| `$COUNT == 0` OR demo is 6+ days old (likely expiring soon) | Run `create-demo.sh` — create new + wait + reconfigure |

## Step 3a — Use existing demo

```bash
bash scripts/use-demo.sh
```

Captures and parses the final JSON line (last line of stdout). All log lines
go to stderr. On success the script prints the new org/repo — the user then
restarts the stack and triggers a sync manually.

## Step 3b — Create new demo (if needed)

```bash
bash scripts/create-demo.sh
```

This creates an issue in `octodemo/bootstrap`, polls for the `demo::provisioned`
label (up to 20 minutes), then exec-replaces itself with `use-demo.sh`.
The final JSON output is identical to Step 3a.

## Step 4 — Parse and report output

Both scripts emit a single JSON line as their last stdout line:

**Success:**
```json
{"status":"success","action":"use","newOrg":"octodemo","newRepo":"octocat_supply-<slug>","issueUrl":"https://github.com/octodemo/bootstrap/issues/<n>","grafanaUrl":"http://localhost:3006/d/overview"}
```

**Error:**
```json
{"status":"error","code":"ERR_...","message":"...","hint":"..."}
```

Parse the last stdout line:
```bash
RESULT=$(bash scripts/use-demo.sh 2>/dev/null | tail -1)
STATUS=$(echo "$RESULT" | grep -o '"status":"[^"]*"' | sed 's/"status":"//;s/"$//')
```

On `status: success`, report to the user:
- `newOrg/newRepo` — the new target
- `grafanaUrl` — open Grafana to verify data

## Step 5 — Error routing

| Code | What happened | What to do |
|------|--------------|------------|
| `ERR_GH_AUTH` | `gh` CLI is not authenticated or can't reach `octodemo/bootstrap` | Run `gh auth login --hostname github.com` |
| `ERR_NO_TOKEN` | `.env` is missing or has no `GITHUB_TOKEN` | Invoke the `setup-env` skill |
| `ERR_DASHBOARD_TOKEN_INVALID` | `GITHUB_TOKEN` in `.env` is expired (got 401) | Invoke the `setup-env` skill to update the token |
| `ERR_DASHBOARD_TOKEN_NO_REPO_ACCESS` | Token can't read the new demo repo (404/403) | Ensure the PAT owner is a member of `octodemo`; wait if the demo just started provisioning |
| `ERR_NO_PROVISIONED_DEMO` | No open `demo::provisioned` issue for this user | Run `create-demo.sh` |
| `ERR_PROVISION_TIMEOUT` | Bootstrap workflow didn't label the issue within 20min | The `issueUrl` field in the JSON has the issue URL; check the Actions run in `octodemo/bootstrap`. When ready, re-run: `bash scripts/use-demo.sh --issue <n>` |
| `ERR_DOCKER_NOT_RUNNING` | Docker daemon is not running | Start Docker Desktop |
| `ERR_SYNC_FAILED` | Sync server errored or didn't start | Check: `docker compose logs sync-server` |
| `ERR_SYNC_DID_NOT_PERSIST` | Sync completed but `app_config.repo` doesn't match | Check: `docker compose logs sync-server \| tail -50`; may need manual re-sync |

## Important

- **Do NOT echo `GITHUB_TOKEN`** back to the user. The token is in `.env`
  and the script reads it directly — you never need to display it.
- `GITHUB_ENTERPRISE` is **never changed** by these scripts. It is constant
  across all `octodemo` demo environments.
- The scripts are idempotent — running `use-demo.sh` twice in a row when
  `.env` already points at the right repo is a safe no-op (it still triggers
  a fresh sync, which refreshes data).
- Demo environments are in the **private** `octodemo` org. The bootstrap repo
  and provisioned repos are only accessible to `octodemo` members.
