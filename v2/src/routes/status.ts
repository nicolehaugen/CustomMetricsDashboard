import { Router, Request, Response } from 'express';
import { getPool } from '../db/connection';

const router = Router();

router.get('/:jobId', async (req: Request, res: Response) => {
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT id, status, started_at, finished_at, records_synced, error_message
     FROM sync_jobs WHERE id = $1`,
    [parseInt(req.params.jobId, 10)]
  );
  if (rows.length === 0) {
    res.status(404).json({ error: 'Job not found' });
    return;
  }
  res.json(rows[0]);
});

export default router;
