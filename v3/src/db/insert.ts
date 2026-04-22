import { Pool } from 'pg';

export async function loadColumns(table: string, pool: Pool): Promise<Set<string>> {
  const { rows } = await pool.query(
    `SELECT column_name FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = $1`,
    [table]
  );
  return new Set(rows.map((r: { column_name: string }) => r.column_name));
}

function inferType(val: unknown): string {
  if (val === null || val === undefined) return 'TEXT';
  if (typeof val === 'boolean')          return 'BOOLEAN';
  if (typeof val === 'number')           return Number.isInteger(val) ? 'BIGINT' : 'NUMERIC';
  if (typeof val === 'string')           return 'TEXT';
  if (typeof val === 'object')           return 'JSONB';
  return 'TEXT';
}

export interface DriftEntry {
  table: string;
  auto_applied: { field: string; sample_value: unknown; added_type: string }[];
}

export async function applyDrift(
  table: string,
  sample: Record<string, unknown>,
  columns: Set<string>,
  pool: Pool
): Promise<DriftEntry | null> {
  const applied: DriftEntry['auto_applied'] = [];
  for (const [field, val] of Object.entries(sample)) {
    if (columns.has(field)) continue;
    const type = inferType(val);
    console.log(`[drift] ${table}.${field} → ADD COLUMN ${type}`);
    await pool.query(`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS "${field}" ${type}`);
    columns.add(field);
    applied.push({ field, sample_value: val, added_type: type });
  }
  return applied.length > 0 ? { table, auto_applied: applied } : null;
}

function prepareValue(val: unknown): unknown {
  if (val === null || val === undefined) return null;
  if (typeof val === 'object') return JSON.stringify(val);
  return val;
}

export async function insertRows(
  table: string,
  records: Record<string, unknown>[],
  columns: Set<string>,
  pool: Pool
): Promise<void> {
  if (records.length === 0) return;

  const fields = Object.keys(records[0]).filter(f => columns.has(f));
  if (fields.length === 0) return;

  const colList = fields.map(f => `"${f}"`).join(', ');

  for (const record of records) {
    const vals = fields.map(f => prepareValue(record[f]));
    const placeholders = vals.map((_, i) => `$${i + 1}`).join(', ');
    try {
      await pool.query(
        `INSERT INTO ${table} (${colList}) VALUES (${placeholders}) ON CONFLICT DO NOTHING`,
        vals
      );
    } catch (err) {
      console.warn(`[insert] ${table} row skipped:`, (err as Error).message);
    }
  }
}
