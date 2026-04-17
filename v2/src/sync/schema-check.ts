import { Pool } from 'pg';

export class SchemaMismatchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SchemaMismatchError';
  }
}

export interface SchemaDriftEntry {
  table: string;
  /** API response fields with no matching DB column (GitHub added new fields). */
  added: string[];
  /** DB columns not present in the API response (GitHub removed fields). */
  removed: string[];
}

/**
 * Detects schema drift between a GitHub API response object and the DB table.
 * Returns drift info (added/removed fields) rather than throwing, so that syncs
 * can complete and callers can surface drift in dashboards.
 *
 * For `copilot_seats` backward-compatibility, `assertSchemaMatch` is preserved
 * and still throws — it delegates to `detectSchemaDrift` internally.
 */
export async function detectSchemaDrift(
  table: string,
  apiRecord: Record<string, unknown>,
  pool: Pool
): Promise<SchemaDriftEntry | null> {
  const { rows } = await pool.query(
    `SELECT column_name FROM information_schema.columns WHERE table_name = $1`,
    [table]
  );
  const dbCols = new Set(rows.map((r: { column_name: string }) => r.column_name));
  // Ignore internal/bookkeeping columns that are never present in the API response.
  const ignoredCols = new Set(['id', 'fetched_at', 'raw_data']);
  const apiKeys = new Set(Object.keys(apiRecord));

  const added = [...apiKeys].filter(k => !dbCols.has(k));
  const removed = [...dbCols].filter(k => !ignoredCols.has(k) && !apiKeys.has(k));

  if (added.length === 0 && removed.length === 0) return null;
  return { table, added, removed };
}

/** Legacy function kept for copilot_seats usage — throws on any missing column. */
export async function assertSchemaMatch(
  table: string,
  apiRecord: Record<string, unknown>,
  pool: Pool
): Promise<void> {
  const drift = await detectSchemaDrift(table, apiRecord, pool);
  if (drift && drift.added.length > 0) {
    throw new SchemaMismatchError(
      `Table '${table}' is missing columns for API fields: ${drift.added.join(', ')}. ` +
      `Run schema migration and re-sync.`
    );
  }
}
