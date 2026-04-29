import { readFileSync } from 'fs';
import type { Pool } from 'pg';

/**
 * Parse `CREATE TABLE [IF NOT EXISTS] <name> ( ... );` blocks out of a
 * schema.sql file and return one (table, column) pair per declared column.
 *
 * The parser is intentionally minimal — schema.sql is hand-written and
 * predictable. It strips line comments, finds each CREATE TABLE block,
 * walks the parenthesised body splitting on top-level commas, and treats
 * the first whitespace-delimited token of each non-constraint line as the
 * column name.
 */
export function parseSchemaColumns(sql: string): { table: string; column: string }[] {
  // Strip -- line comments (keeps content inside string literals fine
  // because schema.sql does not use single quotes containing "--").
  const cleaned = sql.replace(/--[^\n]*/g, '');

  const out: { table: string; column: string }[] = [];
  const tableRegex = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?([a-zA-Z_][a-zA-Z0-9_]*)\s*\(/gi;

  let m: RegExpExecArray | null;
  while ((m = tableRegex.exec(cleaned)) !== null) {
    const table = m[1];
    // Walk forward from the opening paren to the matching close paren,
    // tracking nesting depth so we don't terminate on type-decl parens
    // like NUMERIC(10,2).
    let i = tableRegex.lastIndex;
    let depth = 1;
    const start = i;
    while (i < cleaned.length && depth > 0) {
      const c = cleaned[i];
      if (c === '(') depth++;
      else if (c === ')') depth--;
      if (depth === 0) break;
      i++;
    }
    if (depth !== 0) continue; // malformed
    const body = cleaned.slice(start, i);

    // Split on commas that are at depth 0.
    const parts: string[] = [];
    let buf = '';
    let d = 0;
    for (const ch of body) {
      if (ch === '(') d++;
      else if (ch === ')') d--;
      if (ch === ',' && d === 0) {
        parts.push(buf);
        buf = '';
      } else {
        buf += ch;
      }
    }
    if (buf.trim().length) parts.push(buf);

    for (const raw of parts) {
      const line = raw.trim();
      if (!line) continue;
      // Skip table-level constraints
      const upper = line.toUpperCase();
      if (
        upper.startsWith('PRIMARY KEY') ||
        upper.startsWith('FOREIGN KEY') ||
        upper.startsWith('UNIQUE') ||
        upper.startsWith('CHECK') ||
        upper.startsWith('CONSTRAINT')
      ) {
        continue;
      }
      const tok = line.match(/^([a-zA-Z_][a-zA-Z0-9_]*)/);
      if (!tok) continue;
      out.push({ table, column: tok[1] });
    }
  }

  return out;
}

/**
 * Read schema.sql from disk and refresh the schema_columns index.
 * Truncates first so removed columns disappear from the index.
 */
export async function indexSchemaColumns(
  pool: Pool,
  schemaSqlPath: string
): Promise<{ tables: number; columns: number }> {
  let sql: string;
  try {
    sql = readFileSync(schemaSqlPath, 'utf8');
  } catch (err) {
    console.warn(`[index-schema] cannot read ${schemaSqlPath}:`, (err as Error).message);
    return { tables: 0, columns: 0 };
  }

  const rows = parseSchemaColumns(sql);
  const tables = new Set(rows.map(r => r.table)).size;

  await pool.query('TRUNCATE TABLE schema_columns');
  for (const r of rows) {
    await pool.query(
      `INSERT INTO schema_columns (table_name, column_name)
       VALUES ($1, $2)
       ON CONFLICT (table_name, column_name) DO UPDATE SET indexed_at = NOW()`,
      [r.table, r.column]
    );
  }

  console.log(`[index-schema] indexed ${rows.length} columns across ${tables} tables`);
  return { tables, columns: rows.length };
}
