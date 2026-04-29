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
