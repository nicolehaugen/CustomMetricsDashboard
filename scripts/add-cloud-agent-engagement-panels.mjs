#!/usr/bin/env node
// One-shot patcher: append "Copilot Cloud Agent Engagement" section to
// v3/grafana/dashboards/10-enterprise-copilot-leading.json.
//
// Adds 7 panels (ids 309-315) at y=308 mirroring the Code Review Engagement
// pattern. Reads/writes JSON in place; idempotent (skips if id 310 row exists).

import fs from 'node:fs';
import path from 'node:path';

const FILE = path.resolve('v3/grafana/dashboards/10-enterprise-copilot-leading.json');
const dash = JSON.parse(fs.readFileSync(FILE, 'utf8'));

if (dash.panels.some((p) => p.id === 310 && p.type === 'row')) {
  console.log('Section already present (row id 310 exists). No-op.');
  process.exit(0);
}

const DS = { type: 'grafana-postgresql-datasource', uid: 'PostgreSQL' };
const Y0 = 308;

const learningGuide = [
  '### Copilot Cloud Agent Engagement (DAU / WAU / MAU)',
  '',
  '**API source** — `GET /enterprises/{enterprise}/copilot/metrics/reports/organization-28-day/latest` (2026-03-10), fields `daily_active_copilot_cloud_agent_users`, `weekly_active_copilot_cloud_agent_users`, `monthly_active_copilot_cloud_agent_users`.',
  '',
  '**What it measures** — Distinct enterprise members who triggered at least one Copilot Cloud Agent task in the last 1 / 7 / 28 days. The Cloud Agent is the asynchronous "coding agent that runs in the cloud and opens PRs", distinct from in-IDE chat or completion.',
  '',
  '**Calculation** — Pre-aggregated by GitHub. The stat panels show `MAX` of each window across the dashboard time range; the timeseries plots the value reported per day.',
  '',
  '**How to interpret**',
  '',
  '| Signal | Healthy | Action needed |',
  '|---|---|---|',
  '| MAU grows month-over-month | ✅ Cloud Agent adoption expanding | — |',
  '| WAU/MAU stickiness ≥ 0.4 | ✅ Returning users | < 0.2 — one-shot novelty; investigate enablement / docs |',
  '| DAU near 0 while seats grow | ⚠️ Awareness gap | Run enablement; share Cloud Agent demo |',
  '',
  '---',
  '',
  '### Underlying SQL',
  '',
  '**Daily Active Cloud Agent Users**',
  '',
  '```sql',
  'SELECT MAX(daily_active_copilot_cloud_agent_users) AS value',
  'FROM copilot_enterprise_daily',
  "WHERE day >= (SELECT MAX(day) - INTERVAL '27 days' FROM copilot_enterprise_daily)",
  '```',
  '',
  '**Weekly Active Cloud Agent Users (7d)**',
  '',
  '```sql',
  'SELECT MAX(weekly_active_copilot_cloud_agent_users) AS value',
  'FROM copilot_enterprise_daily',
  "WHERE day >= (SELECT MAX(day) - INTERVAL '27 days' FROM copilot_enterprise_daily)",
  '```',
  '',
  '**Monthly Active Cloud Agent Users (28d)**',
  '',
  '```sql',
  'SELECT MAX(monthly_active_copilot_cloud_agent_users) AS value',
  'FROM copilot_enterprise_daily',
  "WHERE day >= (SELECT MAX(day) - INTERVAL '27 days' FROM copilot_enterprise_daily)",
  '```',
  '',
  '**Cloud Agent Active Users — Daily (DAU / WAU / MAU)**',
  '',
  '```sql',
  'SELECT day AS time,',
  '  daily_active_copilot_cloud_agent_users   AS "DAU",',
  '  weekly_active_copilot_cloud_agent_users  AS "WAU (7d)",',
  '  monthly_active_copilot_cloud_agent_users AS "MAU (28d)"',
  'FROM copilot_enterprise_daily',
  "WHERE day >= (SELECT MAX(day) - INTERVAL '27 days' FROM copilot_enterprise_daily)",
  'ORDER BY day',
  '```',
].join('\n');

const newPanels = [
  // Spacer
  {
    id: 309,
    type: 'text',
    title: '',
    transparent: true,
    gridPos: { x: 0, y: Y0, w: 24, h: 4 },
    options: { mode: 'markdown', content: '' },
  },
  // Row
  {
    id: 310,
    type: 'row',
    collapsed: false,
    title: 'Copilot Cloud Agent Engagement (DAU / WAU / MAU) — Learning Guide',
    gridPos: { x: 0, y: Y0 + 4, w: 24, h: 1 },
    panels: [],
  },
  // Stat: DAU
  {
    id: 311,
    type: 'stat',
    title: 'Daily Active Cloud Agent Users',
    description:
      'daily_active_copilot_cloud_agent_users — distinct enterprise users who triggered the Copilot Cloud Agent on the most recent day in the selected range.',
    gridPos: { x: 0, y: Y0 + 5, w: 8, h: 6 },
    datasource: DS,
    targets: [
      {
        refId: 'A',
        format: 'table',
        rawSql:
          "SELECT MAX(daily_active_copilot_cloud_agent_users) AS value FROM copilot_enterprise_daily WHERE day >= (SELECT MAX(day) - INTERVAL '27 days' FROM copilot_enterprise_daily)",
      },
    ],
  },
  // Stat: WAU
  {
    id: 312,
    type: 'stat',
    title: 'Weekly Active Cloud Agent Users (7d)',
    description:
      'weekly_active_copilot_cloud_agent_users — distinct enterprise users who triggered the Cloud Agent in the last 7 days.',
    gridPos: { x: 8, y: Y0 + 5, w: 8, h: 6 },
    datasource: DS,
    targets: [
      {
        refId: 'A',
        format: 'table',
        rawSql:
          "SELECT MAX(weekly_active_copilot_cloud_agent_users) AS value FROM copilot_enterprise_daily WHERE day >= (SELECT MAX(day) - INTERVAL '27 days' FROM copilot_enterprise_daily)",
      },
    ],
  },
  // Stat: MAU
  {
    id: 313,
    type: 'stat',
    title: 'Monthly Active Cloud Agent Users (28d)',
    description:
      'monthly_active_copilot_cloud_agent_users — distinct enterprise users who triggered the Cloud Agent in the last 28 days.',
    gridPos: { x: 16, y: Y0 + 5, w: 8, h: 6 },
    datasource: DS,
    targets: [
      {
        refId: 'A',
        format: 'table',
        rawSql:
          "SELECT MAX(monthly_active_copilot_cloud_agent_users) AS value FROM copilot_enterprise_daily WHERE day >= (SELECT MAX(day) - INTERVAL '27 days' FROM copilot_enterprise_daily)",
      },
    ],
  },
  // Timeseries
  {
    id: 314,
    type: 'timeseries',
    title: 'Cloud Agent Active Users — Daily (DAU / WAU / MAU)',
    description: 'Daily values of all three rolling-window active-user counts for the Copilot Cloud Agent.',
    gridPos: { x: 0, y: Y0 + 11, w: 24, h: 8 },
    datasource: DS,
    targets: [
      {
        refId: 'A',
        format: 'time_series',
        rawSql:
          'SELECT day AS time, daily_active_copilot_cloud_agent_users AS "DAU", weekly_active_copilot_cloud_agent_users AS "WAU (7d)", monthly_active_copilot_cloud_agent_users AS "MAU (28d)" FROM copilot_enterprise_daily WHERE day >= (SELECT MAX(day) - INTERVAL \'27 days\' FROM copilot_enterprise_daily) ORDER BY day',
      },
    ],
  },
  // Learning Guide
  {
    id: 315,
    type: 'text',
    title: 'Copilot Cloud Agent Engagement — Learning Guide',
    gridPos: { x: 0, y: Y0 + 19, w: 24, h: 18 },
    options: { mode: 'markdown', content: learningGuide },
  },
];

dash.panels.push(...newPanels);
fs.writeFileSync(FILE, JSON.stringify(dash, null, 2) + '\n');
console.log(`Appended ${newPanels.length} panels (ids 309-315) at y=${Y0}.`);
