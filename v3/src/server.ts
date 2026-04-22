import express from 'express';
import cors from 'cors';
import { config } from './config';
import { runSync } from './sync/orchestrator';

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
  res.json({ status: 'started' });
  try {
    await runSync();
  } catch (err) {
    console.error('[server] Sync failed:', err);
  } finally {
    syncRunning = false;
  }
});

app.listen(config.port, () => {
  console.log(`[server] Sync server running on port ${config.port}`);
});
