import { Router } from 'express';
import { getPool } from '../db/connection';

const router = Router();

router.get('/', async (_req, res) => {
  try {
    const pool = getPool();
    const result = await pool.query(
      'SELECT source_type, repository, updated_at FROM data_source_metadata ORDER BY updated_at DESC LIMIT 1'
    );

    if (result.rows.length === 0) {
      res.json({ source_type: 'unknown', repository: null, updated_at: null });
      return;
    }

    res.json(result.rows[0]);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    res.status(500).json({ error: message });
  }
});

export default router;
