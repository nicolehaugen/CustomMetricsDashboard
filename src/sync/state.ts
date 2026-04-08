import { getPool } from '../db/connection';

export async function getLastSyncedAt(resource: string): Promise<Date | null> {
  const pool = getPool();
  const result = await pool.query(
    'SELECT last_synced_at FROM sync_state WHERE resource_name = $1',
    [resource]
  );
  if (result.rows.length === 0 || !result.rows[0].last_synced_at) {
    return null;
  }
  return new Date(result.rows[0].last_synced_at);
}

export async function updateSyncState(resource: string, syncedAt: Date): Promise<void> {
  const pool = getPool();
  await pool.query(
    `INSERT INTO sync_state (resource_name, last_synced_at)
     VALUES ($1, $2)
     ON CONFLICT (resource_name) DO UPDATE SET last_synced_at = $2`,
    [resource, syncedAt]
  );
}
