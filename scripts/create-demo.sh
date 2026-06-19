#!/usr/bin/env bash
# create-demo.sh — Create a new OctoCat Supply Platform demo in octodemo/bootstrap
# and configure the dashboard to point at it.
#
# Usage: bash scripts/create-demo.sh
#
# Polls every 30s (up to 20min) for the demo::provisioned label, then
# delegates to use-demo.sh to update .env.
#
# Error codes:
#   ERR_GH_AUTH            gh CLI not authenticated or bootstrap unreachable
#   ERR_PROVISION_TIMEOUT  issue not labeled demo::provisioned within 20 minutes

set -euo pipefail

# Prevent Git Bash on Windows from rewriting /repos/... paths as filesystem paths.
export MSYS_NO_PATHCONV=1

BOOTSTRAP_REPO="octodemo/bootstrap"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TIMEOUT_MIN=20
ISSUE_URL=""

log() { echo "[create-demo] $*" >&2; }

json_escape() {
  local s="$1"
  s="${s//\\/\\\\}"
  s="${s//\"/\\\"}"
  s="${s//$'\n'/\\n}"
  printf '%s' "$s"
}

emit_error() {
  local code="$1" msg="$2" hint="${3:-}"
  printf '{"status":"error","code":"%s","message":"%s","hint":"%s","issueUrl":"%s"}\n' \
    "$(json_escape "$code")" \
    "$(json_escape "$msg")" \
    "$(json_escape "$hint")" \
    "$(json_escape "$ISSUE_URL")"
  exit 1
}

# --- Pre-flight: gh CLI auth --------------------------------------------------

if ! gh auth status --hostname github.com >/dev/null 2>&1; then
  emit_error "ERR_GH_AUTH" \
    "gh CLI is not authenticated against github.com" \
    "Run: gh auth login --hostname github.com"
fi

if ! gh api "/repos/$BOOTSTRAP_REPO" --silent 2>/dev/null; then
  emit_error "ERR_GH_AUTH" \
    "Cannot reach octodemo/bootstrap (401/403/404)" \
    "Ensure your gh account is a member of octodemo with repo access"
fi

# --- Create issue -------------------------------------------------------------

log "Creating demo issue in $BOOTSTRAP_REPO..."

ISSUE_BODY='### Backend

nodejs

### Needs Azure Deployment?

No

### Bootstrap Demo Definition

`{"url":"https://github.com/octodemo-framework/demo_octocat_supply"}`

### Demo Version

v4.10.0'

ISSUE_URL="$(printf '%s' "$ISSUE_BODY" | \
  gh issue create \
    -R "$BOOTSTRAP_REPO" \
    -t "Demo Creation :: OctoCat Supply Platform :: v4.10.0" \
    -l "demo" \
    -l "template" \
    -F -)"

ISSUE_JSON="$(gh issue view "$ISSUE_URL" -R "$BOOTSTRAP_REPO" --json number,url)"
ISSUE_NUMBER="$(printf '%s' "$ISSUE_JSON" | grep -o '"number":[0-9]*' | grep -o '[0-9]*')"
log "Created issue #$ISSUE_NUMBER: $ISSUE_URL"

# --- Poll for demo::provisioned label ----------------------------------------

log "Waiting for provisioning (up to ${TIMEOUT_MIN}min, polling every 30s)..."
DEADLINE=$(( $(date +%s) + TIMEOUT_MIN * 60 ))

while true; do
  if [[ "$(date +%s)" -ge "$DEADLINE" ]]; then
    emit_error "ERR_PROVISION_TIMEOUT" \
      "Issue #$ISSUE_NUMBER not labeled demo::provisioned within ${TIMEOUT_MIN} minutes" \
      "Re-run once ready: bash scripts/use-demo.sh --issue $ISSUE_NUMBER"
  fi

  ISSUE_DATA="$(gh issue view "$ISSUE_NUMBER" -R "$BOOTSTRAP_REPO" --json labels,title)"
  LABELS="$(printf '%s' "$ISSUE_DATA" | grep -o '"name":"[^"]*"' | sed 's/"name":"//;s/"$//' | tr '\n' ',')"
  TITLE="$(printf '%s' "$ISSUE_DATA" | grep -o '"title":"[^"]*"' | head -1 | sed 's/"title":"//;s/"$//')"

  if printf '%s' "$LABELS" | grep -q "demo::provisioned" && \
     printf '%s' "$TITLE"  | grep -q "^Demo ::"; then
    log "Provisioned! $TITLE"
    break
  fi

  log "Not yet provisioned — sleeping 30s..."
  sleep 30
done

# --- Delegate to use-demo.sh --------------------------------------------------

exec bash "$SCRIPT_DIR/use-demo.sh" --issue "$ISSUE_NUMBER"