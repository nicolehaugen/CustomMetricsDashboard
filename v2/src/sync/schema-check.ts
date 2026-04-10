import { Pool } from 'pg';

export class SchemaMismatchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SchemaMismatchError';
  }
}

export async function assertSchemaMatch(
  table: string,
  apiRecord: Record<string, unknown>,
  pool: Pool
): Promise<void> {
  const { rows } = await pool.query(
    `SELECT column_name FROM information_schema.columns WHERE table_name = $1`,
    [table]
  );
  const dbCols = new Set(rows.map((r: { column_name: string }) => r.column_name));
  const apiKeys = Object.keys(apiRecord);
  const missingCols = apiKeys.filter(k => !dbCols.has(k));

  if (missingCols.length > 0) {
    throw new SchemaMismatchError(
      `Table '${table}' is missing columns for API keys: ${missingCols.join(', ')}. ` +
      `Run schema migration and re-sync.`
    );
  }
}
