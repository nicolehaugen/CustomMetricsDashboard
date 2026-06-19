#!/usr/bin/env bash
# use-demo.sh — Configure the CustomMetricsDashboard against the user's
# currently-provisioned octodemo/bootstrap demo environment.
#
# Usage:
#   bash scripts/use-demo.sh [--dry-run] [--issue <number>] [--skip-sync]
#
# Flags:
#   --dry-run       Print what would change without modifying .env or Docker.
#   --issue <n>     Use a specific bootstrap issue number instead of auto-discovery.
#   --skip-sync     Rewrite .env but skip docker compose + sync trigger.
#
# Error codes (emitted in JSON on non-zero exit):
#   ERR_GH_AUTH                   gh CLI is not authenticated or can't reach octodemo/bootstrap
#   ERR_NO_TOKEN                  .env missing or GITHUB_TOKEN not set
#   ERR_NO_PROVISIONED_DEMO       No demo::provisioned issue found for current user
#   ERR_BAD_ISSUE_TITLE           Issue title doesn't match expected format
#   ERR_DASHBOARD_TOKEN_INVALID   .env GITHUB_TOKEN returns 401 against GitHub API
#   ERR_DASHBOARD_TOKEN_NO_REPO_ACCESS  .env GITHUB_TOKEN can't read the new demo repo (404/403)
#   ERR_DOCKER_NOT_RUNNING        Docker daemon is not running
#   ERR_SYNC_FAILED               POST /sync returned non-200 or error body
#   ERR_SYNC_DID_NOT_PERSIST      app_config.repo doesn't match new repo after sync

set -euo pipefail

# Prevent Git Bash on Windows from rewriting /repos/... paths as filesystem paths.
export MSYS_NO_PATHCONV=1

# ─── Defaults ────────────────────────────────────────────────────────────────

DRY_RUN=false
ISSUE_NUMBER=""
SKIP_SYNC=false
BOOTSTRAP_REPO="octodemo/bootstrap"
DEMO_ORG="octodemo"

# ─── Resolve repo root (script can be called from anywhere) ──────────────────

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
ENV_FILE="$REPO_ROOT/.env"

# ─── Arg parsing ─────────────────────────────────────────────────────────────

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run)   DRY_RUN=true;  shift ;;
    --skip-sync) SKIP_SYNC=true; shift ;;
    --issue)     ISSUE_NUMBER="$2"; shift 2 ;;
    *) echo "Unknown flag: $1" >&2; exit 1 ;;
  esac
done

# ─── Helpers ─────────────────────────────────────────────────────────────────

emit_error() {
  local code="$1" msg="$2" hint="${3:-}"
  printf '{"status":"error","code":"%s","message":"%s","hint":"%s"}\n' \
    "$code" "$msg" "$hint"
  exit 1
}

emit_success() {
  local new_repo="$1" issue_url="$2"
  printf '{"status":"success","action":"use","newOrg":"%s","newRepo":"%s","issueUrl":"%s","grafanaUrl":"http://localhost:3006/d/overview"}\n' \
    "$DEMO_ORG" "$new_repo" "$issue_url"
}

log() { echo "[use-demo] $*" >&2; }

# ─── Pre-flight A: gh CLI auth + bootstrap repo access ───────────────────────

log "Pre-flight A: checking gh CLI auth..."
if ! gh auth status --hostname github.com >/dev/null 2>&1; then
  emit_error "ERR_GH_AUTH" \
    "gh CLI is not authenticated against github.com" \
    "Run: gh auth login --hostname github.com"
fi

if ! gh api "/repos/$BOOTSTRAP_REPO" --silent 2>/dev/null; then
  emit_error "ERR_GH_AUTH" \
    "Cannot reach octodemo/bootstrap (401/403/404 from gh CLI)" \
    "Ensure your gh account is a member of octodemo with repo access"
fi
log "  gh auth OK"

# ─── Pre-flight B: .env exists and has GITHUB_TOKEN ──────────────────────────

log "Pre-flight B: checking .env..."
if [[ ! -f "$ENV_FILE" ]]; then
  emit_error "ERR_NO_TOKEN" \
    ".env file not found at $ENV_FILE" \
    "Run: cp .env.example .env  then fill in your GITHUB_TOKEN"
fi

GITHUB_TOKEN=""
while IFS= read -r line || [[ -n "$line" ]]; do
  [[ "$line" =~ ^[[:space:]]*# ]] && continue
  [[ "$line" =~ ^GITHUB_TOKEN=(.+)$ ]] && GITHUB_TOKEN="${BASH_REMATCH[1]}" && break
done < "$ENV_FILE"

if [[ -z "$GITHUB_TOKEN" ]]; then
  emit_error "ERR_NO_TOKEN" \
    "GITHUB_TOKEN is not set in $ENV_FILE" \
    "Add GITHUB_TOKEN=ghp_... to .env — see the setup-env skill"
fi
log "  .env OK (token present)"

# ─── Discover provisioned issue ──────────────────────────────────────────────

GH_USER="$(gh api /user --jq '.login' 2>/dev/null)"
if [[ -z "$GH_USER" ]]; then
  emit_error "ERR_GH_AUTH" \
    "Could not determine gh CLI username" \
    "Run: gh auth login"
fi
log "gh user: $GH_USER"

if [[ -n "$ISSUE_NUMBER" ]]; then
  log "Using specified issue #$ISSUE_NUMBER..."
  ISSUE_JSON="$(gh api "/repos/$BOOTSTRAP_REPO/issues/$ISSUE_NUMBER" \
    --jq '{number, title, html_url, labels: [.labels[].name]}')"
else
  log "Discovering provisioned demo for $GH_USER..."
  ALL_ISSUES="$(gh api -X GET "/repos/$BOOTSTRAP_REPO/issues" \
    -f "labels=demo::provisioned" \
    -f "state=open" \
    -f "creator=$GH_USER" \
    --jq '[.[] | {number, title, html_url, labels: [.labels[].name], updated_at}]')"

  COUNT="$(printf '%s' "$ALL_ISSUES" | grep -c '"number"' || true)"
  if [[ "$COUNT" -eq 0 ]]; then
    emit_error "ERR_NO_PROVISIONED_DEMO" \
      "No open demo::provisioned issue found for $GH_USER in octodemo/bootstrap" \
      "Run: bash scripts/create-demo.sh"
  fi

  if [[ "$COUNT" -gt 1 ]]; then
    log "  WARNING: $COUNT provisioned demos found; using most recently updated"
  fi

  ISSUE_JSON="$(printf '%s' "$ALL_ISSUES" | \
    gh api --input /dev/stdin --jq '.' 2>/dev/null || \
    printf '%s' "$ALL_ISSUES" | \
    grep -o '{[^}]*}' | head -1 || echo "{}")"
  # Simpler: just re-query for the first one
  ISSUE_JSON="$(gh api -X GET "/repos/$BOOTSTRAP_REPO/issues" \
    -f "labels=demo::provisioned" \
    -f "state=open" \
    -f "creator=$GH_USER" \
    -f "per_page=1" \
    -f "sort=updated" \
    -f "direction=desc" \
    --jq '.[0] | {number, title, html_url}')"
fi

ISSUE_TITLE="$(printf '%s' "$ISSUE_JSON" | grep -o '"title":"[^"]*"' | sed 's/"title":"//;s/"$//')"
ISSUE_URL="$(printf '%s' "$ISSUE_JSON" | grep -o '"html_url":"[^"]*"' | sed 's/"html_url":"//;s/"$//')"
ISSUE_NUM="$(printf '%s' "$ISSUE_JSON" | grep -o '"number":[0-9]*' | grep -o '[0-9]*')"

log "Issue #$ISSUE_NUM: $ISSUE_TITLE"

# ─── Parse repo slug from issue title ────────────────────────────────────────
# Expected format: "Demo :: <repo-slug> :: <version> :: <actor>"

NEW_REPO="$(printf '%s' "$ISSUE_TITLE" | \
  sed -n 's/^Demo :: \([a-zA-Z0-9._-][a-zA-Z0-9._-]*\) ::.*/\1/p')"

if [[ -z "$NEW_REPO" ]]; then
  emit_error "ERR_BAD_ISSUE_TITLE" \
    "Cannot parse repo slug from title: $ISSUE_TITLE" \
    "Expected format: 'Demo :: <slug> :: <version> :: <actor>'"
fi
log "Parsed repo slug: $NEW_REPO"

# ─── Verify dashboard token can reach the new repo ───────────────────────────

log "Verifying dashboard token against octodemo/$NEW_REPO..."
HTTP_CODE="$(curl -sS -o /dev/null -w "%{http_code}" \
  -H "Authorization: Bearer $GITHUB_TOKEN" \
  "https://api.github.com/repos/$DEMO_ORG/$NEW_REPO" 2>/dev/null || echo "000")"

case "$HTTP_CODE" in
  200) log "  token OK" ;;
  401) emit_error "ERR_DASHBOARD_TOKEN_INVALID" \
        "GITHUB_TOKEN in .env is invalid or expired (got 401)" \
        "Update GITHUB_TOKEN in .env — use the setup-env skill" ;;
  403) emit_error "ERR_DASHBOARD_TOKEN_NO_REPO_ACCESS" \
        "GITHUB_TOKEN in .env cannot access octodemo/$NEW_REPO (got 403)" \
        "Ensure the PAT owner has repo access to octodemo" ;;
  404) emit_error "ERR_DASHBOARD_TOKEN_NO_REPO_ACCESS" \
        "GITHUB_TOKEN in .env cannot see octodemo/$NEW_REPO (got 404)" \
        "Repo may be still provisioning, or token lacks octodemo repo scope" ;;
  *)   emit_error "ERR_DASHBOARD_TOKEN_NO_REPO_ACCESS" \
        "Unexpected HTTP $HTTP_CODE from GitHub API for octodemo/$NEW_REPO" \
        "Check network connectivity and token validity" ;;
esac

# ─── Check if .env already has these values (idempotent fast-path) ────────────

CURRENT_ORG="$(grep -E '^GITHUB_ORG=' "$ENV_FILE" | head -1 | cut -d= -f2- || echo "")"
CURRENT_REPO="$(grep -E '^GITHUB_REPO=' "$ENV_FILE" | head -1 | cut -d= -f2- || echo "")"

if [[ "$CURRENT_ORG" == "$DEMO_ORG" && "$CURRENT_REPO" == "$NEW_REPO" ]]; then
  log "  .env already points to $DEMO_ORG/$NEW_REPO — no change needed"
  if $DRY_RUN || $SKIP_SYNC; then
    emit_success "$NEW_REPO" "$ISSUE_URL"
  fi
  # Still run sync in case data is stale
fi

# ─── Dry-run: show what would change ─────────────────────────────────────────

if $DRY_RUN; then
  log "DRY RUN — no files or containers modified"
  log "  Would set GITHUB_ORG=$DEMO_ORG  (was: ${CURRENT_ORG:-<unset>})"
  log "  Would set GITHUB_REPO=$NEW_REPO  (was: ${CURRENT_REPO:-<unset>})"
  log "  Would backup: $ENV_FILE -> ${ENV_FILE}.bak.<ts>"
  log "  Would run: docker compose up -d --build"
  log "  Would POST: http://localhost:3005/sync"
  emit_success "$NEW_REPO" "$ISSUE_URL"
fi

# ─── Backup and atomically rewrite .env ──────────────────────────────────────

BACKUP="$ENV_FILE.bak.$(date +%s)"
cp "$ENV_FILE" "$BACKUP"
log "  Backed up .env -> $BACKUP"

TMPFILE="$(mktemp)"
awk -v new_org="$DEMO_ORG" -v new_repo="$NEW_REPO" '
  /^[[:space:]]*GITHUB_ORG=/ { print "GITHUB_ORG=" new_org; next }
  /^[[:space:]]*GITHUB_REPO=/ { print "GITHUB_REPO=" new_repo; next }
  { print }
' "$ENV_FILE" > "$TMPFILE"

# If GITHUB_ORG or GITHUB_REPO were not already in the file, append them
if ! grep -qE '^[[:space:]]*GITHUB_ORG=' "$TMPFILE"; then
  echo "GITHUB_ORG=$DEMO_ORG" >> "$TMPFILE"
fi
if ! grep -qE '^[[:space:]]*GITHUB_REPO=' "$TMPFILE"; then
  echo "GITHUB_REPO=$NEW_REPO" >> "$TMPFILE"
fi

mv "$TMPFILE" "$ENV_FILE"
log "  .env updated: GITHUB_ORG=$DEMO_ORG, GITHUB_REPO=$NEW_REPO"

# ─── Skip-sync fast exit ─────────────────────────────────────────────────────

if $SKIP_SYNC; then
  log "  --skip-sync: skipping Docker + sync"
  emit_success "$NEW_REPO" "$ISSUE_URL"
fi

# ─── Docker: verify daemon is running ────────────────────────────────────────

log "Checking Docker daemon..."
if ! docker info >/dev/null 2>&1; then
  emit_error "ERR_DOCKER_NOT_RUNNING" \
    "Docker daemon is not running" \
    "Start Docker Desktop, then retry"
fi

# ─── Restart sync-server container with new .env ─────────────────────────────

log "Running docker compose up -d --build (from $REPO_ROOT)..."
(cd "$REPO_ROOT" && docker compose up -d --build >/dev/null 2>&1)

log "Waiting for sync server to be ready on :3005..."
for i in $(seq 1 30); do
  if curl -sf http://localhost:3005/health >/dev/null 2>&1; then
    log "  sync server ready (attempt $i)"
    break
  fi
  if [[ "$i" -eq 30 ]]; then
    emit_error "ERR_SYNC_FAILED" \
      "Sync server did not become healthy within 60s" \
      "Check logs: docker compose logs sync-server"
  fi
  sleep 2
done

# ─── Trigger sync ─────────────────────────────────────────────────────────────

log "Triggering sync..."
SYNC_RESPONSE="$(curl -sS -X POST http://localhost:3005/sync 2>/dev/null || echo '{"error":"curl failed"}')"
log "  sync response: $SYNC_RESPONSE"

if printf '%s' "$SYNC_RESPONSE" | grep -q '"error"'; then
  emit_error "ERR_SYNC_FAILED" \
    "POST /sync returned an error: $SYNC_RESPONSE" \
    "Check logs: docker compose logs sync-server"
fi

# ─── Verify persisted to app_config ──────────────────────────────────────────

log "Verifying app_config.repo in Postgres..."
PERSISTED_REPO="$(docker exec custom-metrics-dashboard-postgres-1 \
  psql -U postgres -d metrics -tAc \
  "SELECT value FROM app_config WHERE key='repo'" 2>/dev/null | tr -d '[:space:]' || echo "")"

if [[ "$PERSISTED_REPO" != "$NEW_REPO" ]]; then
  emit_error "ERR_SYNC_DID_NOT_PERSIST" \
    "app_config.repo is '$PERSISTED_REPO', expected '$NEW_REPO'" \
    "Check sync logs: docker compose logs sync-server | tail -50"
fi
log "  Verified: app_config.repo = $PERSISTED_REPO"

# ─── Done ─────────────────────────────────────────────────────────────────────

emit_success "$NEW_REPO" "$ISSUE_URL"
