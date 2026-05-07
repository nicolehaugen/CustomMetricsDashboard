# Setup .env — Configure GitHub PAT and target environment

You are helping the user configure their local `v3/.env` file so the
CustomMetricsDashboard sync service can fetch data from their GitHub
environment.

## Steps

1. **Ask the user** for the following values (one question at a time):
   - **GitHub Personal Access Token (PAT)** — must be a **Classic PAT**
     (fine-grained tokens are not supported by Copilot org endpoints).
     Required scopes: `repo`, `read:org`, `admin:org`, `actions`, `copilot`.
     Enterprise Copilot metrics also require Enterprise Owner role.
   - **GitHub Organization slug** (e.g. `my-org`)
   - **GitHub Repository name** (e.g. `my-repo`)
   - **Enterprise slug** *(optional)* — only needed for enterprise-level
     Copilot metrics endpoints. Leave blank if not applicable.

2. **Create or update `v3/.env`.**
   - If `v3/.env` does not exist, copy `v3/.env.example` to `v3/.env` first.
   - Set these variables with the user-provided values:
     ```
     GITHUB_TOKEN=<PAT>
     GITHUB_ORG=<org>
     GITHUB_REPO=<repo>
     GITHUB_ENTERPRISE=<enterprise>   # blank if not provided
     ```
   - Leave all other variables (PostgreSQL, PORT, etc.) at their existing
     values or `.env.example` defaults.

3. **Verify the token** by running:
   ```bash
   cd v3
   set -a; . ./.env; set +a
   curl -s -o /dev/null -w "%{http_code}" \
     -H "Authorization: Bearer $GITHUB_TOKEN" \
     https://api.github.com/orgs/$GITHUB_ORG
   ```
   Report whether the response is `200` (success) or an error code.

4. **Remind the user:**
   - Never commit `v3/.env` to source control (it is gitignored).
   - After changing the token, restart the sync server to pick up
     new values: `docker-compose restart sync-server` from `v3/`.
   - Required PAT scopes: `repo`, `read:org`, `admin:org`, `actions`, `copilot`.

## Important

- **Do NOT echo the PAT** back to the user in plain text after they
  provide it. Confirm it was written to `.env` without displaying the value.
- If `v3/.env` already exists and has a non-placeholder `GITHUB_TOKEN`,
  warn the user that the existing token will be overwritten and ask for
  confirmation before proceeding.
