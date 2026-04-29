import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import type { Pool } from 'pg';

interface PanelLike {
  id?: number;
  title?: string;
  type?: string;
  panels?: PanelLike[];
  targets?: { rawSql?: string }[];
}

interface DashboardJson {
  uid?: string;
  panels?: PanelLike[];
}

function collectPanels(panels: PanelLike[] | undefined, out: PanelLike[]): void {
  if (!panels) return;
  for (const p of panels) {
    out.push(p);
    if (p.panels && p.panels.length) collectPanels(p.panels, out);
  }
}

/**
 * Scan grafana/dashboards/*.json and upsert one row per panel-with-rawSql
 * into the dashboard_panel_sql table. Truncates first so removed panels
 * disappear from the index.
 */
export async function indexDashboardSql(
  pool: Pool,
  dashboardsDir: string
): Promise<{ files: number; panels: number }> {
  let files = 0;
  let panels = 0;
  const rows: { uid: string; id: number; title: string; sql: string }[] = [];

  let entries: string[];
  try {
    entries = readdirSync(dashboardsDir).filter(f => f.endsWith('.json'));
  } catch (err) {
    console.warn(`[index-dashboards] cannot read ${dashboardsDir}:`, (err as Error).message);
    return { files: 0, panels: 0 };
  }

  for (const file of entries) {
    files++;
    try {
      const json = JSON.parse(readFileSync(join(dashboardsDir, file), 'utf8')) as DashboardJson;
      const uid = json.uid || file.replace(/\.json$/, '');
      const flat: PanelLike[] = [];
      collectPanels(json.panels, flat);
      for (const p of flat) {
        if (typeof p.id !== 'number' || !p.targets) continue;
        for (const t of p.targets) {
          if (typeof t.rawSql === 'string' && t.rawSql.trim().length > 0) {
            rows.push({ uid, id: p.id, title: p.title || '', sql: t.rawSql });
            panels++;
            break; // one row per panel
          }
        }
      }
    } catch (err) {
      console.warn(`[index-dashboards] skip ${file}:`, (err as Error).message);
    }
  }

  await pool.query('TRUNCATE TABLE dashboard_panel_sql');
  for (const r of rows) {
    await pool.query(
      `INSERT INTO dashboard_panel_sql (dashboard_uid, panel_id, panel_title, raw_sql)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (dashboard_uid, panel_id) DO UPDATE
         SET panel_title = EXCLUDED.panel_title,
             raw_sql = EXCLUDED.raw_sql,
             indexed_at = NOW()`,
      [r.uid, r.id, r.title, r.sql]
    );
  }

  console.log(`[index-dashboards] indexed ${panels} panels across ${files} files`);
  return { files, panels };
}
