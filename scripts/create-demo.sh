#!/usr/bin/env bash
# create-demo.sh — Create a new octodemo/bootstrap demo environment and
# configure the CustomMetricsDashboard to point at it.
#
# Usage:
#   bash scripts/create-demo.sh [--backend nodejs|python|java|php]
#                               [--azure no|yes]
#                               [--version v4.10.0]
#                               [--timeout-min 20]
#                               [--dry-run]
#                               [--skip-sync]
#
# After the issue is labeled demo::provisioned this script exec-replaces
# itself with use-demo.sh so the final JSON output follows the same contract.
#
# Error codes:
#   ERR_GH_AUTH             gh CLI is not authenticated or bootstrap unreachable
#   ERR_PROVISION_TIMEOUT   issue was not labeled demo::provisioned within timeout

set -euo pipefail

# Prevent Git Bash on Windows from rewriting /repos/... paths as filesystem paths.
export MSYS_NO_PATHCONV=1

# ─── Defaults ────────────────────────────────────────────────────────────────

BACKEND="nodejs"
AZURE="No"
VERSION="v4.10.0"
TIMEOUT_MIN=20
DRY_RUN=false
SKIP_SYNC=false
BOOTSTRAP_REPO="octodemo/bootstrap"
DEDUPE_MARKER="created-by: refresh-demo-env"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# ─── Arg parsing ─────────────────────────────────────────────────────────────

while [[ $# -gt 0 ]]; do
  case "$1" in
    --backend)     BACKEND="$2";                        shift 2 ;;
    --azure)       AZURE="$2";                          shift 2 ;;
    --version)     VERSION="$2";                        shift 2 ;;
    --timeout-min) TIMEOUT_MIN="$2";                    shift 2 ;;
    --dry-run)     DRY_RUN=true;                        shift ;;
    --skip-sync)   SKIP_SYNC=true;                      shift ;;
    *) echo "Unknown flag: $1" >&2; exit 1 ;;
  esac
done

# Normalize azure flag
case "${AZURE,,}" in
  yes|y|true)  AZURE="Yes" ;;
  no|n|false)  AZURE="No"  ;;
esac

# ─── Helpers ─────────────────────────────────────────────────────────────────

emit_error() {
  local code="$1" msg="$2" hint="${3:-}"
  printf '{"status":"error","code":"%s","message":"%s","hint":"%s","issueUrl":"%s"}\n' \
    "$code" "$msg" "$hint" "${ISSUE_URL:-}"
  exit 1
}

log() { echo "[create-demo] $*" >&2; }

ISSUE_URL=""

# ─── Pre-flight A: gh CLI auth + bootstrap repo access ───────────────────────

log "Pre-flight: checking gh CLI auth..."
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

GH_USER="$(gh api /user --jq '.login' 2>/dev/null)"
log "gh user: $GH_USER"

# ─── Dedupe: reuse a recent unprovisioned issue if <24h old ──────────────────

log "Checking for recent unprovisioned issue with dedupe marker..."
EXISTING_ISSUE=""
EXISTING_ISSUES="$(gh api -X GET "/repos/$BOOTSTRAP_REPO/issues" \
  -f "state=open" \
  -f "creator=$GH_USER" \
  -f "per_page=10" \
  --jq '[.[] | select(.labels | map(.name) | contains(["demo::provisioned"]) | not) | {number, title, html_url, created_at, body}]' \
  2>/dev/null || echo '[]')"

CUTOFF_TS="$(date -u -d '24 hours ago' '+%Y-%m-%dT%H:%M:%SZ' 2>/dev/null || \
             date -u -v-24H '+%Y-%m-%dT%H:%M:%SZ' 2>/dev/null || \
             echo "")"

while IFS= read -r num; do
  [[ -z "$num" ]] && continue
  issue_body="$(gh issue view "$num" -R "$BOOTSTRAP_REPO" --json body --jq '.body' 2>/dev/null || echo "")"
  issue_created="$(gh issue view "$num" -R "$BOOTSTRAP_REPO" --json createdAt --jq '.createdAt' 2>/dev/null || echo "")"

  if printf '%s' "$issue_body" | grep -qF "$DEDUPE_MARKER"; then
    # Check if <24h old (best-effort; skip if date comparison unavailable)
    if [[ -n "$CUTOFF_TS" && "$issue_created" < "$CUTOFF_TS" ]]; then
      log "  Found dedupe issue #$num but it is >24h old — will create a new one"
    else
      log "  Reusing existing unprovisioned issue #$num (< 24h old)"
      EXISTING_ISSUE="$num"
      break
    fi
  fi
done < <(printf '%s' "$EXISTING_ISSUES" | grep -o '"number":[0-9]*' | grep -o '[0-9]*')

# ─── Create or reuse issue ────────────────────────────────────────────────────

if [[ -n "$EXISTING_ISSUE" ]]; then
  ISSUE_NUMBER="$EXISTING_ISSUE"
  ISSUE_URL="$(gh issue view "$ISSUE_NUMBER" -R "$BOOTSTRAP_REPO" --json url --jq '.url')"
  log "Reusing issue #$ISSUE_NUMBER: $ISSUE_URL"
else
  ISSUE_TITLE="Demo Creation :: OctoCat Supply Platform :: $VERSION"

  # Build Issue Forms canonical markdown body
  ISSUE_BODY="### Backend

$BACKEND

### Needs Azure Deployment?

$AZURE

### Bootstrap Demo Definition

\`{\"url\":\"https://github.com/octodemo-framework/demo_octocat_supply\"}\`

### Demo Version

$VERSION

<!-- $DEDUPE_MARKER -->"

  if $DRY_RUN; then
    log "DRY RUN — would create issue in $BOOTSTRAP_REPO:"
    log "  Title: $ISSUE_TITLE"
    log "  Backend: $BACKEND | Azure: $AZURE | Version: $VERSION"
    printf '{"status":"success","action":"dry-run-create","newOrg":"octodemo","newRepo":"<pending>","issueUrl":"<not-created>","grafanaUrl":"http://localhost:3006/d/overview"}\n'
    exit 0
  fi

  log "Creating issue in $BOOTSTRAP_REPO..."
  ISSUE_JSON="$(printf '%s' "$ISSUE_BODY" | \
    gh issue create \
      -R "$BOOTSTRAP_REPO" \
      -t "$ISSUE_TITLE" \
      -l "demo" \
      -l "template" \
      -F - \
      --json number,url 2>/dev/null)"

  ISSUE_NUMBER="$(printf '%s' "$ISSUE_JSON" | grep -o '"number":[0-9]*' | grep -o '[0-9]*')"
  ISSUE_URL="$(printf '%s' "$ISSUE_JSON" | grep -o '"url":"[^"]*"' | sed 's/"url":"//;s/"$//')"
  log "Created issue #$ISSUE_NUMBER: $ISSUE_URL"
fi

# ─── Poll for demo::provisioned label ────────────────────────────────────────

log "Polling for demo::provisioned label (timeout: ${TIMEOUT_MIN}min)..."
DEADLINE=$(( $(date +%s) + TIMEOUT_MIN * 60 ))
POLL_INTERVAL=30
DOTS=0

while true; do
  NOW="$(date +%s)"
  if [[ "$NOW" -ge "$DEADLINE" ]]; then
    emit_error "ERR_PROVISION_TIMEOUT" \
      "Issue #$ISSUE_NUMBER was not labeled demo::provisioned within ${TIMEOUT_MIN} minutes" \
      "The bootstrap workflow may still be running. Re-run: bash scripts/use-demo.sh --issue $ISSUE_NUMBER"
  fi

  ISSUE_DATA="$(gh issue view "$ISSUE_NUMBER" -R "$BOOTSTRAP_REPO" \
    --json labels,title 2>/dev/null || echo '{}')"

  LABELS="$(printf '%s' "$ISSUE_DATA" | grep -o '"name":"[^"]*"' | sed 's/"name":"//;s/"$//' | tr '\n' ',' || echo "")"
  TITLE="$(printf '%s' "$ISSUE_DATA" | grep -o '"title":"[^"]*"' | head -1 | sed 's/"title":"//;s/"$//' || echo "")"

  if printf '%s' "$LABELS" | grep -q "demo::provisioned" && \
     printf '%s' "$TITLE" | grep -q "^Demo ::"; then
    log ""
    log "  Provisioned! Title: $TITLE"
    break
  fi

  DOTS=$(( (DOTS + 1) % 4 ))
  SPINNER="$(printf '%0.s.' $(seq 1 $((DOTS + 1))))"
  printf '\r[create-demo] Waiting for provisioning%s (%.0fs elapsed)   ' \
    "$SPINNER" "$(( NOW - (DEADLINE - TIMEOUT_MIN * 60) ))" >&2
  sleep "$POLL_INTERVAL"
done

# ─── Delegate to use-demo.sh ─────────────────────────────────────────────────

log "Provisioning complete. Delegating to use-demo.sh --issue $ISSUE_NUMBER..."

EXTRA_FLAGS=()
$DRY_RUN   && EXTRA_FLAGS+=("--dry-run")
$SKIP_SYNC && EXTRA_FLAGS+=("--skip-sync")

exec bash "$SCRIPT_DIR/use-demo.sh" \
  --issue "$ISSUE_NUMBER" \
  "${EXTRA_FLAGS[@]}"
