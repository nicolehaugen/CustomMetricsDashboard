// One-shot generator. Run with: node v3/scripts/generate-leading-dashboards.mjs
// Generates 10-enterprise-copilot-leading.json and 11-organization-copilot-leading.json
// matching the 09-per-user-copilot.json format (banner + overview + per-metric
// spacer/row/stat/text learning guide sections).

import { writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = resolve(__dirname, '../grafana/dashboards');

const PG_DS = { type: 'grafana-postgresql-datasource', uid: 'PostgreSQL' };

/** @typedef {{label:string, sql:string, source:string, table:string, calc:string, healthy:string, action:string, unit?:string, decimals?:number}} Metric */

/**
 * Section list — same metrics for both dashboards, but each scope uses a
 * different SQL `WHERE` clause and source table. The `sqlBody` placeholder is
 * substituted per scope by `buildDashboard`.
 */
function metricSections() {
  return [
    {
      group: 'Adoption',
      items: [
        {
          label: 'Daily Active Users (peak in range)',
          field: 'daily_active_users',
          agg: 'MAX',
          source: '`day_totals[].daily_active_users`',
          calc: 'Maximum daily active user count observed during the selected window. A user is "daily active" if they had any Copilot activity that calendar day.',
          healthy: 'Trends upward as adoption grows',
          action: 'Flat or declining — investigate adoption blockers',
        },
        {
          label: 'Weekly Active Users (peak in range)',
          field: 'weekly_active_users',
          agg: 'MAX',
          source: '`day_totals[].weekly_active_users`',
          calc: 'Maximum weekly active user count observed in the window — number of unique users active during a rolling 7-day window.',
          healthy: 'Steadily climbing or stable near seat count',
          action: 'Far below seat count — large idle population',
        },
        {
          label: 'Monthly Active Users',
          field: 'monthly_active_users',
          agg: 'MAX',
          source: '`day_totals[].monthly_active_users`',
          calc: 'Maximum monthly active user count in the window. Represents licensed users active in the rolling 28-day period.',
          healthy: 'Approaches assigned-seat count',
          action: 'Significantly below seats — license waste',
        },
        {
          label: 'Monthly Active Agent Users',
          field: 'monthly_active_agent_users',
          agg: 'MAX',
          source: '`day_totals[].monthly_active_agent_users`',
          calc: 'Maximum count of users who used Copilot agent mode in the IDE during the rolling 28-day window.',
          healthy: 'Growing as agent adoption matures',
          action: 'Near zero — users not exploring agent capabilities',
        },
        {
          label: 'Monthly Active Chat Users',
          field: 'monthly_active_chat_users',
          agg: 'MAX',
          source: '`day_totals[].monthly_active_chat_users`',
          calc: 'Maximum count of users who used Copilot chat (any mode) in the IDE during the rolling 28-day window.',
          healthy: 'Most active users also use chat',
          action: 'Chat usage lagging behind completions',
        },
        {
          label: 'Daily Active CLI Users (peak in range)',
          field: 'daily_active_cli_users',
          agg: 'MAX',
          source: '`day_totals[].daily_active_cli_users`',
          calc: 'Maximum count of users who used `gh copilot` (CLI) on any single day in the window. Independent of IDE activity.',
          healthy: 'Non-zero indicates CLI adoption',
          action: 'Always zero — CLI not promoted to users',
        },
      ],
    },
    {
      group: 'Code Volume',
      items: [
        {
          label: 'Lines of Code Suggested to Add (28d)',
          field: 'loc_suggested_to_add_sum',
          agg: 'SUM',
          source: '`day_totals[].loc_suggested_to_add_sum`',
          calc: 'Total lines of code Copilot suggested to add (completions, inline chat, chat panel — excludes agent edits).',
          healthy: 'Grows with active usage',
          action: 'Flat — usage stalled',
        },
        {
          label: 'Lines of Code Suggested to Delete (28d)',
          field: 'loc_suggested_to_delete_sum',
          agg: 'SUM',
          source: '`day_totals[].loc_suggested_to_delete_sum`',
          calc: 'Total lines Copilot suggested to delete (future support planned — may report 0).',
          healthy: 'Non-zero in agent/edit-heavy orgs',
          action: 'N/A — feature still rolling out',
        },
        {
          label: 'Lines of Code Added (28d)',
          field: 'loc_added_sum',
          agg: 'SUM',
          source: '`day_totals[].loc_added_sum`',
          calc: 'Total lines actually added to the editor — accepted completions, applied chat code blocks, and agent/edit mode writes.',
          healthy: 'Significant fraction of `loc_suggested_to_add_sum`',
          action: 'Far below suggested — low acceptance',
        },
        {
          label: 'Lines of Code Deleted (28d)',
          field: 'loc_deleted_sum',
          agg: 'SUM',
          source: '`day_totals[].loc_deleted_sum`',
          calc: 'Total lines deleted from the editor (currently from agent edits).',
          healthy: 'Indicates agent/edit mode in use',
          action: 'Zero — agent/edit mode not adopted',
        },
      ],
    },
    {
      group: 'Interactions',
      items: [
        {
          label: 'Total User-Initiated Interactions (28d)',
          field: 'user_initiated_interaction_count',
          agg: 'SUM',
          source: '`day_totals[].user_initiated_interaction_count`',
          calc: 'Sum of explicit prompts users sent to Copilot — chat messages, accept actions, etc. Does not count opening the panel or switching modes.',
          healthy: 'Grows week-over-week',
          action: 'Flat or declining — explore blockers',
        },
        {
          label: 'Code Generation Activities (28d)',
          field: 'code_generation_activity_count',
          agg: 'SUM',
          source: '`day_totals[].code_generation_activity_count`',
          calc: 'Number of distinct Copilot output events generated — each code block from a single prompt counts separately.',
          healthy: 'Higher than interaction count (one prompt → many blocks)',
          action: 'Lower than interactions — short responses or low engagement',
        },
        {
          label: 'Code Acceptance Activities (28d)',
          field: 'code_acceptance_activity_count',
          agg: 'SUM',
          source: '`day_totals[].code_acceptance_activity_count`',
          calc: 'Number of suggestions or code blocks accepted by users — apply-to-file, insert-at-cursor, copy button. Excludes manual OS clipboard.',
          healthy: 'Strong fraction of generation activities',
          action: 'Very low ratio — relevance issues',
        },
      ],
    },
    {
      group: 'Pull Request Activity',
      // PR metrics are stored as JSONB in the `pull_requests` column.
      pr: true,
      items: [
        {
          label: 'PRs Created (28d)',
          field: 'total_created',
          agg: 'SUM',
          unit: 'none',
          source: '`day_totals[].pull_requests.total_created`',
          calc: 'Total pull requests created on each day in the window. Creation is a one-time event — each PR counted only on its creation day.',
          healthy: 'Steady or growing PR throughput',
          action: 'Sharp drop — investigate workflow blockers',
        },
        {
          label: 'PRs Reviewed (28d)',
          field: 'total_reviewed',
          agg: 'SUM',
          unit: 'none',
          source: '`day_totals[].pull_requests.total_reviewed`',
          calc: 'Pull requests reviewed each day. A PR may be counted on multiple days if it receives reviews on multiple days; once per day per PR.',
          healthy: 'Tracks closely with PRs created',
          action: 'Reviews lagging — review bottleneck',
        },
        {
          label: 'PRs Merged (28d)',
          field: 'total_merged',
          agg: 'SUM',
          unit: 'none',
          source: '`day_totals[].pull_requests.total_merged`',
          calc: 'Pull requests merged each day. One-time event — each PR counted only on merge day.',
          healthy: 'Consistent flow into main branch',
          action: 'Significantly lower than created — backlog growing',
        },
        {
          label: 'Median Minutes to Merge (28d avg)',
          field: 'median_minutes_to_merge',
          agg: 'AVG',
          unit: 'm',
          decimals: 1,
          source: '`day_totals[].pull_requests.median_minutes_to_merge`',
          calc: 'Average of the daily median minutes between PR creation and merge for PRs merged that day. Median reduces the impact of long-running outliers.',
          healthy: 'Lower is better — fast merge cycle',
          action: 'Climbing — review or CI bottleneck',
        },
        {
          label: 'PR Review Suggestions (28d)',
          field: 'total_suggestions',
          agg: 'SUM',
          unit: 'none',
          source: '`day_totals[].pull_requests.total_suggestions`',
          calc: 'Total PR review suggestions generated each day, regardless of author (humans + Copilot).',
          healthy: 'Active code review culture',
          action: 'Near zero — reviewers leaving narrative comments only',
        },
        {
          label: 'PR Applied Suggestions (28d)',
          field: 'total_applied_suggestions',
          agg: 'SUM',
          unit: 'none',
          source: '`day_totals[].pull_requests.total_applied_suggestions`',
          calc: 'Total PR review suggestions that were applied each day, regardless of author.',
          healthy: 'Strong fraction of total suggestions',
          action: 'Low ratio — suggestions ignored or low-quality',
        },
        {
          label: 'PRs Created by Copilot (28d)',
          field: 'total_created_by_copilot',
          agg: 'SUM',
          unit: 'none',
          source: '`day_totals[].pull_requests.total_created_by_copilot`',
          calc: 'Pull requests created by Copilot (coding agent / autofix) each day.',
          healthy: 'Increasing as autonomous PR usage matures',
          action: 'Zero — Copilot agent not creating PRs',
        },
        {
          label: 'PRs Reviewed by Copilot (28d)',
          field: 'total_reviewed_by_copilot',
          agg: 'SUM',
          unit: 'none',
          source: '`day_totals[].pull_requests.total_reviewed_by_copilot`',
          calc: 'Pull requests reviewed by Copilot each day. May count a single PR on multiple days if reviewed on multiple days.',
          healthy: 'Indicates Copilot code review adoption',
          action: 'Zero — Copilot reviewer not enabled or assigned',
        },
        {
          label: 'PRs Merged that Copilot Created (28d)',
          field: 'total_merged_created_by_copilot',
          agg: 'SUM',
          unit: 'none',
          source: '`day_totals[].pull_requests.total_merged_created_by_copilot`',
          calc: 'Number of Copilot-authored PRs that merged each day. One-time event.',
          healthy: 'Healthy fraction of Copilot-created PRs',
          action: 'Many created, few merged — Copilot PR quality issue',
        },
        {
          label: 'Median Minutes to Merge — Copilot Authored (28d avg)',
          field: 'median_minutes_to_merge_copilot_authored',
          agg: 'AVG',
          unit: 'm',
          decimals: 1,
          source: '`day_totals[].pull_requests.median_minutes_to_merge_copilot_authored`',
          calc: 'Average of the daily median minutes from creation to merge for Copilot-authored PRs merged that day.',
          healthy: 'Comparable to or faster than overall median',
          action: 'Much higher — Copilot PRs need extensive rework',
        },
        {
          label: 'Copilot PR Suggestions (28d)',
          field: 'total_copilot_suggestions',
          agg: 'SUM',
          unit: 'none',
          source: '`day_totals[].pull_requests.total_copilot_suggestions`',
          calc: 'PR review suggestions generated by Copilot each day.',
          healthy: 'Growing as Copilot code review adoption rises',
          action: 'Zero — review enrollment may be off',
        },
        {
          label: 'Copilot Applied PR Suggestions (28d)',
          field: 'total_copilot_applied_suggestions',
          agg: 'SUM',
          unit: 'none',
          source: '`day_totals[].pull_requests.total_copilot_applied_suggestions`',
          calc: 'PR review suggestions generated by Copilot that were applied each day.',
          healthy: 'Strong fraction of Copilot suggestions accepted',
          action: 'Low ratio — Copilot reviewer suggestions ignored',
        },
      ],
    },
  ];
}

/**
 * Build a dashboard for the given scope.
 * @param {{uid:string, title:string, description:string, table:string, scopeFilter:string, scopeJsonbFilter:string, overview:string, templating:any[]}} cfg
 */
function buildDashboard(cfg) {
  const sections = metricSections();
  const panels = [];
  let nextId = 1;
  let nextStatId = 100;
  let nextRowId = 200;
  let nextGuideId = 300;
  let nextSpacerId = 400;
  let y = 0;

  // 1. Banner stat
  panels.push({
    id: nextId++,
    type: 'stat',
    title: '',
    description: 'Data mode banner — shows whether this dashboard displays live GitHub data (green), synthetic seed data (amber), or demo data (blue).',
    gridPos: { x: 0, y, w: 24, h: 2 },
    datasource: PG_DS,
    targets: [
      {
        refId: 'A',
        datasource: PG_DS,
        rawSql: "SELECT COALESCE('Live: ' || (SELECT value FROM app_config WHERE key = 'org') || '/' || (SELECT value FROM app_config WHERE key = 'repo'), 'Not yet synced') AS \"Data Source\"",
        format: 'table',
      },
    ],
    fieldConfig: {
      defaults: {
        mappings: [
          { type: 'regex', options: { pattern: 'Live', result: { color: '#73BF69', index: 0 } } },
          { type: 'regex', options: { pattern: 'Seed', result: { color: '#FA6400', index: 1 } } },
          { type: 'regex', options: { pattern: 'Demo', result: { color: '#5794F2', index: 2 } } },
        ],
        thresholds: { mode: 'absolute', steps: [{ color: 'dark-red', value: null }] },
        color: { mode: 'thresholds' },
      },
      overrides: [],
    },
    options: {
      reduceOptions: { calcs: ['lastNotNull'], fields: '/.*/', values: false },
      colorMode: 'background_solid',
      graphMode: 'none',
      justifyMode: 'center',
      textMode: 'value',
      wideLayout: true,
    },
    transparent: false,
  });
  y += 2;

  // 2. Overview markdown
  panels.push({
    id: nextId++,
    type: 'text',
    title: '',
    gridPos: { x: 0, y, w: 24, h: 11 },
    options: { mode: 'markdown', content: cfg.overview },
    transparent: true,
    description: cfg.title,
  });
  y += 11;

  // 3. Per-metric sections
  for (const section of sections) {
    // Group header text
    panels.push({
      id: nextSpacerId++,
      type: 'text',
      title: '',
      transparent: true,
      gridPos: { x: 0, y, w: 24, h: 3 },
      options: { mode: 'markdown', content: `## ${section.group}` },
    });
    y += 3;

    for (const m of section.items) {
      const isPr = !!section.pr;
      const aliasSql = `"${m.label.replace(/"/g, '\\"')}"`;
      const innerExpr = isPr
        ? (m.agg === 'AVG'
            ? `(pull_requests->>'${m.field}')::numeric`
            : `(pull_requests->>'${m.field}')::bigint`)
        : m.field;
      const sql = `SELECT ${m.agg}(${innerExpr}) AS ${aliasSql}\nFROM ${cfg.table}\nWHERE ${cfg.scopeFilter}\n  AND day BETWEEN $__timeFrom()::date AND $__timeTo()::date${
        isPr ? `\n  AND pull_requests ? '${m.field}'` : ''
      }`;

      // Spacer above section
      panels.push({
        id: nextSpacerId++,
        type: 'text',
        title: '',
        transparent: true,
        gridPos: { x: 0, y, w: 24, h: 1 },
        options: { mode: 'markdown', content: '' },
      });
      y += 1;

      // Row (uncollapsed) — title is the learning guide section header
      panels.push({
        id: nextRowId++,
        type: 'row',
        title: `${m.label} — Learning Guide`,
        gridPos: { x: 0, y, w: 24, h: 1 },
        collapsed: false,
        panels: [],
      });
      y += 1;

      // Stat panel
      panels.push({
        id: nextStatId++,
        type: 'stat',
        title: m.label,
        gridPos: { x: 0, y, w: 24, h: 4 },
        datasource: PG_DS,
        targets: [{ refId: 'A', datasource: PG_DS, rawSql: sql, format: 'table' }],
        fieldConfig: {
          defaults: {
            unit: m.unit ?? 'none',
            decimals: m.decimals ?? 0,
            thresholds: { mode: 'absolute', steps: [{ color: 'green', value: null }] },
          },
          overrides: [],
        },
        options: {
          reduceOptions: { calcs: ['lastNotNull'] },
          orientation: 'auto',
          colorMode: 'background',
          graphMode: 'none',
          justifyMode: 'auto',
        },
        description: `Source: Copilot Metrics Reports API → ${m.source} | Table: \`${cfg.table}\``,
      });
      y += 4;

      // Learning Guide markdown
      const guideContent = [
        `### GitHub API Source [→ docs](https://docs.github.com/en/copilot/reference/copilot-usage-metrics/copilot-usage-metrics)`,
        ``,
        `Copilot Metrics Reports API (2026-03-10) → ${m.source}`,
        ``,
        `### Database Table`,
        ``,
        `\`${cfg.table}\``,
        ``,
        `### How It's Calculated`,
        ``,
        m.calc,
        ``,
        `### How to Interpret`,
        ``,
        `| Healthy Signal | Action Needed |`,
        `|---|---|`,
        `| ${m.healthy} | ${m.action} |`,
        ``,
        `### SQL Query`,
        ``,
        '```sql',
        sql,
        '```',
      ].join('\n');

      panels.push({
        id: nextGuideId++,
        type: 'text',
        title: '',
        transparent: true,
        gridPos: { x: 0, y, w: 24, h: 14 },
        options: { mode: 'markdown', content: guideContent },
      });
      y += 14;
    }
  }

  return {
    uid: cfg.uid,
    title: cfg.title,
    description: cfg.description,
    schemaVersion: 36,
    version: 1,
    refresh: '5m',
    time: { from: 'now-28d', to: 'now' },
    timepicker: {},
    templating: { list: cfg.templating },
    annotations: { list: [] },
    panels,
  };
}

const enterpriseOverview = `# 🏢 Enterprise Copilot Leading Indicators

**Enterprise-Scope Copilot Adoption, Code Volume, and Pull Request Activity**

This dashboard surfaces enterprise-aggregate data from the GitHub Copilot Metrics Reports API (\`enterprise-28-day\` report). It shows how the entire enterprise is using Copilot — broken down by adoption metrics (active users), code volume (lines suggested/added/deleted), interaction counts, and pull request activity (creation, review, merge, suggestions — including activity performed by Copilot itself).

## What it Measures

Each metric below corresponds to a field in the [Copilot usage metrics API](https://docs.github.com/en/copilot/reference/copilot-usage-metrics/copilot-usage-metrics). The Pull Request Activity section reflects every \`pull_requests.*\` field documented as **API only** by GitHub.

## Why it Matters

These are *leading indicators* — they predict whether your DORA outcomes will improve. Healthy adoption + healthy PR activity → faster lead time, more deployments. Stagnant adoption → upcoming DORA decline.

> ⚠️ **Note on scope-level differences:** Per GitHub's documentation, organization- and enterprise-level reports may show different totals due to differences in user deduplication and attribution timing.`;

const orgOverview = `# 🏛️ Organization Copilot Leading Indicators

**Organization-Scope Copilot Adoption, Code Volume, and Pull Request Activity**

Use the **Organization** dropdown above to select an organization within the enterprise.

This dashboard surfaces organization-aggregate data from the GitHub Copilot Metrics Reports API (\`organization-28-day\` report). It shows how a single organization is using Copilot — broken down by adoption metrics (active users), code volume (lines suggested/added/deleted), interaction counts, and pull request activity (creation, review, merge, suggestions — including activity performed by Copilot itself).

## What it Measures

Each metric below corresponds to a field in the [Copilot usage metrics API](https://docs.github.com/en/copilot/reference/copilot-usage-metrics/copilot-usage-metrics). The Pull Request Activity section reflects every \`pull_requests.*\` field documented as **API only** by GitHub.

## Why it Matters

Organization-level metrics let you compare divisions, business units, or product teams against each other. Look for orgs lagging in adoption or PR activity that may benefit from targeted enablement.

> ⚠️ **Note on scope-level differences:** Per GitHub's documentation, organization- and enterprise-level reports may show different totals due to differences in user deduplication and attribution timing.`;

const enterprise = buildDashboard({
  uid: 'edu-enterprise-leading',
  title: '🏢 Enterprise Copilot Leading Indicators [Edu]',
  description: 'Enterprise-level Copilot leading indicators — adoption, code volume, interactions, and full pull request activity (all API fields) — aggregated across the enterprise.',
  table: 'copilot_enterprise_daily',
  scopeFilter: '1=1',
  overview: enterpriseOverview,
  templating: [],
});

const organization = buildDashboard({
  uid: 'edu-organization-leading',
  title: '🏛️ Organization Copilot Leading Indicators [Edu]',
  description: 'Organization-level Copilot leading indicators — adoption, code volume, interactions, and full pull request activity (all API fields) — for the selected organization.',
  table: 'copilot_organization_daily',
  scopeFilter: "organization_id = '${organization_id}'",
  overview: orgOverview,
  templating: [
    {
      name: 'organization_id',
      label: 'Organization',
      type: 'query',
      datasource: PG_DS,
      definition: 'SELECT DISTINCT organization_id FROM copilot_organization_daily WHERE organization_id IS NOT NULL ORDER BY organization_id',
      query: 'SELECT DISTINCT organization_id FROM copilot_organization_daily WHERE organization_id IS NOT NULL ORDER BY organization_id',
      refresh: 1,
      sort: 1,
      includeAll: false,
      multi: false,
      options: [],
      hide: 0,
    },
  ],
});

writeFileSync(resolve(OUT_DIR, '10-enterprise-copilot-leading.json'), JSON.stringify(enterprise, null, 2));
writeFileSync(resolve(OUT_DIR, '11-organization-copilot-leading.json'), JSON.stringify(organization, null, 2));

console.log(`Wrote 10-enterprise-copilot-leading.json (${enterprise.panels.length} panels)`);
console.log(`Wrote 11-organization-copilot-leading.json (${organization.panels.length} panels)`);
