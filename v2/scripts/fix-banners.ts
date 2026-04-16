/**
 * One-off migration script: fix banner panels in all Grafana dashboard JSON files.
 *
 * Fixes:
 *   1. SQL: wraps query in COALESCE so an empty data_mode table shows a red error
 *          message instead of Grafana's gray "No data" panel.
 *   2. color.mode: changes from "thresholds" to "fixed" (fixedColor: "dark-red")
 *          so value mapping result.color reliably controls the background_solid
 *          stat panel color in Grafana 11.0.0.
 *   3. Mappings: adds a 4th regex mapping for the ⚠️/No-data-loaded error state → red.
 */

import * as fs from 'fs';
import * as path from 'path';

const DASHBOARDS_DIR = path.join(__dirname, '..', 'grafana', 'dashboards');

const NEW_RAW_SQL =
  "SELECT COALESCE(\n" +
  "  (SELECT \n" +
  "    CASE mode\n" +
  "      WHEN 'live' THEN '📡 Live Data — ' || COALESCE(source_label, '')\n" +
  "      WHEN 'seed' THEN '🌱 Synthetic Seed Data — ' || COALESCE(source_label, '')\n" +
  "      WHEN 'demo' THEN '🎮 Demo Environment — ' || COALESCE(source_label, '')\n" +
  "      ELSE '⚠️ ' || COALESCE(source_label, 'No data loaded — run: npm run seed')\n" +
  "    END\n" +
  "  FROM data_mode ORDER BY updated_at DESC LIMIT 1),\n" +
  "  '🔴 No data loaded — run: npm run seed'\n" +
  ") AS \"Data Source\"";

const ERROR_MAPPING = {
  type: 'regex',
  options: {
    pattern: 'No data loaded|\u26a0\ufe0f',
    result: {
      color: '#E02F44',
      index: 3,
    },
  },
};

function patchDashboard(filePath: string): boolean {
  const raw = fs.readFileSync(filePath, 'utf8');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const dashboard: any = JSON.parse(raw);

  let patched = false;

  for (const panel of dashboard.panels ?? []) {
    const target = (panel.targets ?? []).find(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (t: any) => typeof t.rawSql === 'string' && t.rawSql.includes('FROM data_mode')
    );
    if (!target) continue;

    // 1. Update SQL
    target.rawSql = NEW_RAW_SQL;

    // 2. Fix color mode
    const defaults = panel.fieldConfig?.defaults;
    if (defaults) {
      defaults.color = { mode: 'fixed', fixedColor: 'dark-red' };

      // 3. Add error mapping if not already present
      const mappings: unknown[] = defaults.mappings ?? [];
      const alreadyHasErrorMapping = mappings.some(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (m: any) => m?.options?.pattern?.includes('No data loaded')
      );
      if (!alreadyHasErrorMapping) {
        mappings.push(ERROR_MAPPING);
        defaults.mappings = mappings;
      }
    }

    patched = true;
  }

  if (patched) {
    fs.writeFileSync(filePath, JSON.stringify(dashboard, null, 2) + '\n', 'utf8');
  }
  return patched;
}

function main() {
  const files = fs.readdirSync(DASHBOARDS_DIR).filter(f => f.endsWith('.json'));
  let updated = 0;
  let skipped = 0;

  for (const file of files) {
    const filePath = path.join(DASHBOARDS_DIR, file);
    const result = patchDashboard(filePath);
    if (result) {
      console.log(`  ✅ patched: ${file}`);
      updated++;
    } else {
      console.log(`  ⏭️  skipped (no banner panel): ${file}`);
      skipped++;
    }
  }

  console.log(`\nDone. Updated: ${updated}, Skipped: ${skipped}`);
}

main();
