import { Router } from 'express';
import { getPool } from '../db/connection';

const router = Router();

router.get('/:jobId', async (req, res) => {
  try {
    const pool = getPool();
    const result = await pool.query(
      'SELECT id, status, started_at, finished_at, error_message, records_synced FROM sync_jobs WHERE id = $1',
      [req.params.jobId]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Job not found' });
      return;
    }

    res.json(result.rows[0]);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    res.status(500).json({ error: message });
  }
});

export default router;
