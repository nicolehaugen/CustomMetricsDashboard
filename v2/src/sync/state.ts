import { Pool } from 'pg';

export async function getLastSyncedAt(resource: string, pool: Pool): Promise<Date | null> {
  const { rows } = await pool.query(
    'SELECT last_synced_at FROM sync_state WHERE resource = $1',
    [resource]
  );
  return rows[0]?.last_synced_at ?? null;
}

export async function updateSyncState(resource: string, pool: Pool): Promise<void> {
  await pool.query(
    `INSERT INTO sync_state (resource, last_synced_at)
     VALUES ($1, NOW())
     ON CONFLICT (resource) DO UPDATE SET last_synced_at = NOW()`,
    [resource]
  );
}
