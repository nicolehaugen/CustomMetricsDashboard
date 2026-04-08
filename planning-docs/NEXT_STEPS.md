# Next Steps — Getting the Dashboard Running

## 1. Set Up PostgreSQL

```bash
# Create the database
createdb dora_metrics

# Apply the schema
psql -d dora_metrics -f src/db/schema.sql
```

Or use the setup script:

```bash
bash scripts/setup-db.sh
```

## 2. Configure Environment Variables

```bash
cp .env.example .env
```

Edit `.env` with your values:
- **GITHUB_TOKEN** — Classic PAT with scopes: `repo`, `read:org`, `admin:org`, `actions`
- **PG_\*** — PostgreSQL connection details
- **GITHUB_ORG / GITHUB_REPO** — Target org and repo to sync

## 3. Seed Test Data

```bash
npm run seed
npm run seed:verify
```

## 4. Start the Sync Service

```bash
npm run dev
```

Verify it's running: `curl http://localhost:3001/health`

## 5. Set Up Grafana Provisioning

```bash
bash scripts/setup-grafana.sh
```

Or manually copy files:
- `grafana/provisioning/datasources/postgres.yml` → Grafana's provisioning directory
- `grafana/dashboards/dora-metrics.json` → Grafana's dashboards directory

Restart Grafana after provisioning: `sudo systemctl restart grafana-server`

## 6. Open Grafana

Navigate to **http://localhost:3000** (default credentials: `admin` / `admin`)

Find the **DORA Metrics Dashboard** in the dashboards list.
