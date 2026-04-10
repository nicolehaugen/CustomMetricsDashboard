import { Router, Request, Response } from 'express';
import { getPool } from '../db/connection';
import { createOctokit } from '../github/client';
import { runSync } from '../sync/orchestrator';

const router = Router();

router.post('/', async (_req: Request, res: Response) => {
  const pool = getPool();
  const octokit = createOctokit();

  // Start sync in background — don't await
  const pool2 = getPool();
  runSync(pool2, octokit).then(jobId => {
    console.log(`[sync] Job ${jobId} completed successfully`);
  }).catch(err => {
    console.error('[sync] Sync job failed:', (err as Error).message);
  });

  // Return immediately with the latest running job id
  const { rows } = await pool.query(
    `SELECT id FROM sync_jobs WHERE status = 'running' ORDER BY started_at DESC LIMIT 1`
  );
  const jobId = rows[0]?.id ?? null;
  res.json({ jobId, status: 'started' });
});

export default router;
