import { Router } from 'express';
import { getPool } from '../db/connection';
import { runSync } from '../sync/orchestrator';

const router = Router();

router.post('/', async (_req, res) => {
  try {
    const pool = getPool();
    const result = await pool.query(
      `INSERT INTO sync_jobs (status, started_at) VALUES ('running', NOW()) RETURNING id`
    );
    const jobId: number = result.rows[0].id;

    // Start sync in background — don't await
    runSync(jobId).catch(err => {
      console.error(`Background sync failed (Job #${jobId}):`, err instanceof Error ? err.message : err);
    });

    res.json({ jobId, status: 'started' });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    res.status(500).json({ error: message });
  }
});

export default router;
