import express from 'express';
import cors from 'cors';
import { join } from 'path';
import { config } from './config';
import { runSync } from './sync/orchestrator';
import { indexDashboardSql } from './sync/index-dashboards';
import { indexSchemaColumns } from './sync/index-schema';
import { getPool } from './db/connection';

const app = express();
app.use(cors({ origin: 'http://localhost:3006' }));
app.use(express.json());

let syncRunning = false;

app.get('/health', (_req, res) => res.json({ status: 'ok' }));

// Redirect target after Ignore / Unignore click — back to the Overview
// dashboard. Grafana is on port 3006 in docker-compose.
const OVERVIEW_URL = 'http://localhost:3006/d/overview';

function ignoreResponse(res: express.Response, message: string) {
  res.status(200).type('html').send(
    `<!doctype html><html><head><meta charset="utf-8"><title>${message}</title>` +
    `<meta http-equiv="refresh" content="0;url=${OVERVIEW_URL}"></head>` +
    `<body style="font-family:sans-serif;color:#888">${message} — returning to dashboard…</body></html>`
  );
}

// Add (table, column, scope) to drift_ignores so it disappears from the
// matching drift-detection table. GET so it can be a plain cell-link in
// Grafana. scope is one of: 'schema' | 'panel'.
app.get('/drift/ignore', async (req, res) => {
  const table = String(req.query.table ?? '').trim();
  const column = String(req.query.column ?? '').trim();
  const scope = String(req.query.scope ?? '').trim();
  if (!table || !column) return res.status(400).send('table and column are required');
  if (scope !== 'schema' && scope !== 'panel') {
    return res.status(400).send("scope must be 'schema' or 'panel'");
  }
  try {
    await getPool().query(
      `INSERT INTO drift_ignores (table_name, column_name, scope) VALUES ($1, $2, $3)
       ON CONFLICT (table_name, column_name, scope) DO NOTHING`,
      [table, column, scope]
    );
    ignoreResponse(res, `Ignored ${table}.${column} (${scope})`);
  } catch (err) {
    console.error('[server] drift ignore failed:', err);
    res.status(500).send(`Failed to ignore ${table}.${column}: ${err}`);
  }
});

// Remove (table, column, scope) from drift_ignores so it reappears in
// the matching drift-detection table.
app.get('/drift/unignore', async (req, res) => {
  const table = String(req.query.table ?? '').trim();
  const column = String(req.query.column ?? '').trim();
  const scope = String(req.query.scope ?? '').trim();
  if (!table || !column) return res.status(400).send('table and column are required');
  if (scope !== 'schema' && scope !== 'panel') {
    return res.status(400).send("scope must be 'schema' or 'panel'");
  }
  try {
    await getPool().query(
      `DELETE FROM drift_ignores WHERE table_name = $1 AND column_name = $2 AND scope = $3`,
      [table, column, scope]
    );
    ignoreResponse(res, `Unignored ${table}.${column} (${scope})`);
  } catch (err) {
    console.error('[server] drift unignore failed:', err);
    res.status(500).send(`Failed to unignore ${table}.${column}: ${err}`);
  }
});

app.post('/sync', async (_req, res) => {
  if (syncRunning) {
    return res.status(409).json({ error: 'Sync already running' });
  }
  syncRunning = true;
  try {
    await runSync();
    res.json({ status: 'done' });
  } catch (err) {
    console.error('[server] Sync failed:', err);
    res.status(500).json({ error: String(err) });
  } finally {
    syncRunning = false;
  }
});

app.listen(config.port, () => {
  console.log(`[server] Sync server running on port ${config.port}`);
  // Ensure the drift_ignores table exists for installs whose DB volume
  // pre-dates this feature, and that it has the `scope` column. Idempotent.
  (async () => {
    const pool = getPool();
    await pool.query(
      `CREATE TABLE IF NOT EXISTS drift_ignores (
         table_name TEXT NOT NULL,
         column_name TEXT NOT NULL,
         created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
         PRIMARY KEY (table_name, column_name)
       )`
    );
    // Migrate older installs that don't have the scope column.
    await pool.query(`ALTER TABLE drift_ignores ADD COLUMN IF NOT EXISTS scope TEXT`);
    await pool.query(`UPDATE drift_ignores SET scope = 'panel' WHERE scope IS NULL`);
    await pool.query(`ALTER TABLE drift_ignores ALTER COLUMN scope SET NOT NULL`);
    // Replace the old PK with one that includes scope. The constraint
    // name is the postgres default `<table>_pkey`.
    await pool.query(`ALTER TABLE drift_ignores DROP CONSTRAINT IF EXISTS drift_ignores_pkey`);
    await pool.query(
      `ALTER TABLE drift_ignores ADD CONSTRAINT drift_ignores_pkey
         PRIMARY KEY (table_name, column_name, scope)`
    );
  })().catch(err => console.warn('[server] drift_ignores ensure failed:', err));
  // Index dashboard SQL on startup so the "Drift not yet visualized" panel
  // has fresh data. Failures are non-fatal.
  const dashboardsDir = join(__dirname, '..', 'grafana', 'dashboards');
  indexDashboardSql(getPool(), dashboardsDir).catch(err => {
    console.warn('[server] dashboard SQL index failed:', err);
  });
  // Index schema.sql so the "Drift not yet in schema.sql" panel knows
  // which (table, column) pairs are codified into version control.
  // Reads the schema.sql baked into the Docker image — a `restart` will
  // not pick up edits, only `docker-compose up -d --build`.
  const schemaSqlPath = join(__dirname, 'db', 'schema.sql');
  indexSchemaColumns(getPool(), schemaSqlPath).catch(err => {
    console.warn('[server] schema.sql index failed:', err);
  });
});
