import express from 'express';
import { config } from './config';
import syncRouter from './routes/sync';
import statusRouter from './routes/status';
import { getPool } from './db/connection';
import { initDataMode } from './sync/init-data-mode';
import { runSync } from './sync/orchestrator';
import { createOctokit } from './github/client';

const app = express();
app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', version: '2.0.0' });
});

app.use('/api/sync', syncRouter);
app.use('/api/sync/status', statusRouter);

app.listen(config.port, () => {
  console.log(`Sync server running on port ${config.port}`);

  const pool = getPool();

  // Always ensure data_mode has a row so the dashboard banner is never empty.
  initDataMode(pool)
    .then(async () => {
      // Kick off an initial sync in the background if no successful sync has run yet.
      const { rows } = await pool.query(
        `SELECT COUNT(*) AS cnt FROM sync_jobs WHERE status = 'success'`
      );
      if (parseInt(rows[0].cnt, 10) === 0) {
        console.log('No successful sync found — running initial sync in background...');
        const octokit = createOctokit();
        runSync(pool, octokit).catch((err: unknown) => {
          console.error('Background startup sync failed:', err);
        });
      }
    })
    .catch((err: unknown) => {
      console.error('Failed to initialize data_mode on startup:', err);
    });
});

export default app;
