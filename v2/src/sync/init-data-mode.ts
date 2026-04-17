import { Pool } from 'pg';
import { config } from '../config.js';

/**
 * Ensures data_mode table has at least one row using the current env-var config.
 * Only inserts when the table is empty — never overwrites a row written by a sync or seed.
 */
export async function initDataMode(pool: Pool): Promise<void> {
  await pool.query(
    `INSERT INTO data_mode (mode, source_label, source_url)
     SELECT $1, $2, $3
     WHERE NOT EXISTS (SELECT 1 FROM data_mode)`,
    [config.dataMode, config.dataSourceLabel ?? null, config.dataSourceUrl ?? null]
  );
}
