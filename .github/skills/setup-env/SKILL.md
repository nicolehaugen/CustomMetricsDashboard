---
name: setup-env
description: "**WORKFLOW SKILL** — Configure v3/.env with GitHub PAT, org, repo, required enterprise slug, then verify the token via GitHub API. WHEN: 'set up env', 'configure PAT', 'set GitHub token', 'create .env', 'configure GitHub credentials', 'verify my token'. INVOKES: edits to v3/.env, curl against api.github.com. FOR SINGLE OPERATIONS: edit v3/.env directly if you already have values."
---

# Setup .env — Configure GitHub PAT and target environment

Configure the user's local `v3/.env` so the CustomMetricsDashboard sync service
can fetch data from their GitHub environment.

## 1. Gather values from the user

Ask one question at a time:

- **GitHub Personal Access Token (PAT)** — must be a **Classic PAT**
  (fine-grained tokens are not supported by Copilot org endpoints).
  Required scopes: `repo`, `read:org`, `admin:org`, `actions`, `copilot`.
  Enterprise Copilot metrics also require Enterprise Owner role.
- **GitHub Organization slug** (e.g. `my-org`)
- **GitHub Repository name** (e.g. `my-repo`)
- **Enterprise slug** *(required)* — the v3 sync server (`v3/src/config.ts`)
  fails fast on startup if `GITHUB_ENTERPRISE` is missing. Use the URL-safe
  slug from `https://github.com/enterprises/<slug>`. If the user does not have
  an enterprise, they must still provide a placeholder value to start the
  server, but enterprise Copilot metrics endpoints will return 404.

If `v3/.env` already exists and has a non-placeholder `GITHUB_TOKEN`, warn the
user that the existing token will be overwritten and ask for confirmation
before proceeding.

## 2. Create or update `v3/.env`

- If `v3/.env` does not exist, copy `v3/.env.example` to `v3/.env` first.
- Set these variables with the user-provided values:

  ```
  GITHUB_TOKEN=<PAT>
  GITHUB_ORG=<org>
  GITHUB_REPO=<repo>
  GITHUB_ENTERPRISE=<enterprise>   # required — v3 config.ts throws if unset
  ```

- Leave all other variables (PostgreSQL, PORT, etc.) at their existing values
  or `.env.example` defaults.

## 3. Verify the token

```bash
cd v3
set -a; . ./.env; set +a
curl -s -o /dev/null -w "%{http_code}" \
  -H "Authorization: Bearer $GITHUB_TOKEN" \
  https://api.github.com/orgs/$GITHUB_ORG
```

Report whether the response is `200` (success) or an error code.

## 4. Remind the user

- Never commit `v3/.env` to source control (it is gitignored).
- After changing the token, restart the sync server to pick up new values:
  `docker compose restart sync-server` from `v3/`.
- Required PAT scopes: `repo`, `read:org`, `admin:org`, `actions`, `copilot`.

## Important

- **Do NOT echo the PAT** back to the user in plain text after they provide it.
  Confirm it was written to `.env` without displaying the value.
