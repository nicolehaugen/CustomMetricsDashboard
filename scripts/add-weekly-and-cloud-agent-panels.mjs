#!/usr/bin/env node
// One-shot patch:
//  - dashboards 10 + 11: insert weekly active/passive code-review stat panels into the
//    "Copilot Code Review Engagement" section (between monthly stats and the daily timeseries).
//    All panels at or below the timeseries shift down by +5 rows.
//  - dashboard 09: add `used_copilot_cloud_agent` to the Feature Adoption stat panel (alongside
//    legacy `used_copilot_coding_agent` so historical comparison is preserved).
import fs from 'node:fs';
import path from 'node:path';

const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\//, '')), '..');
const dashDir = path.join(repoRoot, 'grafana', 'dashboards');

function load(p) { return JSON.parse(fs.readFileSync(p, 'utf8')); }
function save(p, obj) { fs.writeFileSync(p, JSON.stringify(obj, null, 2) + '\n'); }
function nextId(panels) { return Math.max(0, ...panels.map(p => p.id || 0)) + 1; }

// ── Dashboards 10 + 11 — insert weekly stats ──────────────────────
function patchLeading({ file, scope, weeklyActiveSql, weeklyPassiveSql }) {
  const fp = path.join(dashDir, file);
  const dash = load(fp);

  // Anchor on the existing "Daily Code Review Users — Active vs Passive" timeseries.
  const tsPanel = dash.panels.find(p =>
    p.type === 'timeseries' && p.title && p.title.startsWith('Daily Code Review Users')
  );
  if (!tsPanel) throw new Error(`${file}: code review timeseries not found`);

  const insertY = tsPanel.gridPos.y; // weekly stats go HERE; timeseries shifts down
  const shiftBy = 5;

  // Shift every panel with y >= insertY down by 5.
  for (const p of dash.panels) {
    if (p.gridPos && p.gridPos.y >= insertY) p.gridPos.y += shiftBy;
  }

  let id = nextId(dash.panels);
  const ds = { type: 'grafana-postgresql-datasource', uid: 'PostgreSQL' };

  const weeklyActive = {
    id: id++,
    type: 'stat',
    title: 'Weekly Active Code Review Users',
    description: 'weekly_active_copilot_code_review_users — distinct users who actively engaged with Copilot code review in the last 7 days.',
    gridPos: { x: 0, y: insertY, w: 12, h: 5 },
    datasource: ds,
    targets: [{ refId: 'A', format: 'table', rawSql: weeklyActiveSql }],
  };
  const weeklyPassive = {
    id: id++,
    type: 'stat',
    title: 'Weekly Passive Code Review Users',
    description: 'weekly_passive_copilot_code_review_users — distinct users who had Copilot auto-assigned to review their PR in the last 7 days but did not engage.',
    gridPos: { x: 12, y: insertY, w: 12, h: 5 },
    datasource: ds,
    targets: [{ refId: 'A', format: 'table', rawSql: weeklyPassiveSql }],
  };

  // Append; Grafana renders by gridPos, not array order.
  dash.panels.push(weeklyActive, weeklyPassive);

  save(fp, dash);
  console.log(`[${scope}] ${file}: inserted weekly stat panels at y=${insertY} (ids ${weeklyActive.id}, ${weeklyPassive.id}); shifted ${dash.panels.length - 2} panels.`);
}

patchLeading({
  file: '10-enterprise-copilot-leading.json',
  scope: 'enterprise',
  weeklyActiveSql:
    "SELECT MAX(weekly_active_copilot_code_review_users) AS value FROM copilot_enterprise_daily WHERE day >= (SELECT MAX(day) - INTERVAL '6 days' FROM copilot_enterprise_daily)",
  weeklyPassiveSql:
    "SELECT MAX(weekly_passive_copilot_code_review_users) AS value FROM copilot_enterprise_daily WHERE day >= (SELECT MAX(day) - INTERVAL '6 days' FROM copilot_enterprise_daily)",
});

patchLeading({
  file: '11-organization-copilot-leading.json',
  scope: 'organization',
  weeklyActiveSql:
    "SELECT weekly_active_copilot_code_review_users AS value FROM copilot_organization_daily WHERE organization_id = '$organization_id' AND weekly_active_copilot_code_review_users IS NOT NULL ORDER BY day DESC LIMIT 1",
  weeklyPassiveSql:
    "SELECT weekly_passive_copilot_code_review_users AS value FROM copilot_organization_daily WHERE organization_id = '$organization_id' AND weekly_passive_copilot_code_review_users IS NOT NULL ORDER BY day DESC LIMIT 1",
});

// ── Dashboard 09 — add used_copilot_cloud_agent to Feature Adoption ─────────
{
  const fp = path.join(dashDir, '09-per-user-copilot.json');
  const dash = load(fp);

  // The Feature Adoption stat panel is the one whose rawSql sums the boolean used_* flags.
  const target = dash.panels.find(p =>
    Array.isArray(p.targets) &&
    p.targets.some(t => t.rawSql && t.rawSql.includes('used_copilot_coding_agent') && t.rawSql.includes('Feature') === false && t.rawSql.includes('used_agent'))
  );
  if (!target) throw new Error('09: Feature Adoption panel not found');

  for (const t of target.targets) {
    if (!t.rawSql || t.rawSql.includes('used_copilot_cloud_agent')) continue;
    // Insert a new column right after the Cloud Agent (legacy) column.
    t.rawSql = t.rawSql.replace(
      '  SUM(CASE WHEN used_copilot_coding_agent THEN 1 ELSE 0 END) AS "Cloud Agent"\n',
      '  SUM(CASE WHEN used_copilot_coding_agent THEN 1 ELSE 0 END) AS "Cloud Agent (legacy)",\n  SUM(CASE WHEN used_copilot_cloud_agent THEN 1 ELSE 0 END) AS "Cloud Agent"\n'
    );
  }

  // Update the description and the matching Learning Guide text panel content.
  if (target.description) {
    target.description = target.description.replace(
      /used_copilot_coding_agent/g,
      'used_copilot_coding_agent, used_copilot_cloud_agent'
    );
  }

  // Locate the Feature Adoption Learning Guide text panel by content hint.
  const lg = dash.panels.find(p =>
    p.type === 'text' && p.options && typeof p.options.content === 'string' &&
    p.options.content.includes('used_copilot_coding_agent') &&
    p.options.content.includes('Feature Definitions')
  );
  if (lg) {
    let c = lg.options.content;
    if (!c.includes('used_copilot_cloud_agent')) {
      // Append cloud agent (new) to the API field list.
      c = c.replace(
        '`used_copilot_coding_agent`',
        '`used_copilot_coding_agent`, `used_copilot_cloud_agent`'
      );
      // Add a new row for the new field in the Feature Definitions table, right after the existing Cloud Agent row.
      c = c.replace(
        '| **Cloud Agent** | `used_copilot_coding_agent` | Developer assigned Copilot to a GitHub Issue or mentioned @copilot in a PR |',
        '| **Cloud Agent (legacy)** | `used_copilot_coding_agent` | Developer assigned Copilot to a GitHub Issue or mentioned @copilot in a PR (pre-2026 field) |\n| **Cloud Agent** | `used_copilot_cloud_agent` | Newer per-user flag for Copilot cloud agent usage (2026-03-10 API). Prefer this for current data. |'
      );
      // Update the SQL block inside the Learning Guide.
      c = c.replace(
        '  SUM(CASE WHEN used_copilot_coding_agent THEN 1 ELSE 0 END) AS "Cloud Agent"\n',
        '  SUM(CASE WHEN used_copilot_coding_agent THEN 1 ELSE 0 END) AS "Cloud Agent (legacy)",\n  SUM(CASE WHEN used_copilot_cloud_agent THEN 1 ELSE 0 END) AS "Cloud Agent"\n'
      );
      lg.options.content = c;
    }
  }

  save(fp, dash);
  console.log('[per-user] 09-per-user-copilot.json: added used_copilot_cloud_agent column to Feature Adoption panel.');
}

console.log('done.');
