import { Octokit } from '@octokit/rest';
import * as fs from 'fs/promises';
import * as path from 'path';

export interface CopilotOrgMetricRecord {
  day: string;
  organization_id: string | null;
  daily_active_users: number | null;
  weekly_active_users: number | null;
  monthly_active_users: number | null;
  monthly_active_agent_users: number | null;
  monthly_active_chat_users: number | null;
  daily_active_cli_users: number | null;
  daily_active_copilot_cloud_agent_users: number | null;
  weekly_active_copilot_cloud_agent_users: number | null;
  monthly_active_copilot_cloud_agent_users: number | null;
  code_acceptance_activity_count: number | null;
  code_generation_activity_count: number | null;
  user_initiated_interaction_count: number | null;
  loc_suggested_to_add_sum: number | null;
  loc_suggested_to_delete_sum: number | null;
  loc_added_sum: number | null;
  loc_deleted_sum: number | null;
  pull_requests: unknown;
  totals_by_feature: unknown;
  totals_by_ide: unknown;
  totals_by_language_feature: unknown;
  totals_by_language_model: unknown;
  totals_by_model_feature: unknown;
  totals_by_cli: unknown;
  raw_data: Record<string, unknown>;
}

export async function fetchCopilotOrgMetrics(
  octokit: Octokit,
  org: string
): Promise<CopilotOrgMetricRecord[]> {
  // Step 1: Get download_links envelope via direct request
  const { data: envelope } = await octokit.request(
    'GET /orgs/{org}/copilot/metrics/reports/organization-28-day/latest',
    { org, headers: { 'X-GitHub-Api-Version': '2026-03-10' } }
  ) as { data: { download_links?: string[] } };
  const downloadLinks: string[] = envelope.download_links ?? [];

  // Step 2: Fetch each signed URL and parse as NDJSON (line-by-line)
  const allRecords: CopilotOrgMetricRecord[] = [];

  for (const url of downloadLinks) {
    const res = await fetch(url);
    const text = await res.text();

    for (const line of text.split('\n').filter((l: string) => l.trim())) {
      const obj = JSON.parse(line);
      // Each NDJSON object has a day_totals array — flatten to individual rows
      const dayTotals: unknown[] = obj.day_totals ?? [obj];
      for (const entry of dayTotals as Record<string, unknown>[]) {
        allRecords.push({
          day: entry.day as string,
          organization_id: (entry.organization_id as string) ?? null,
          daily_active_users: (entry.daily_active_users as number) ?? null,
          weekly_active_users: (entry.weekly_active_users as number) ?? null,
          monthly_active_users: (entry.monthly_active_users as number) ?? null,
          monthly_active_agent_users: (entry.monthly_active_agent_users as number) ?? null,
          monthly_active_chat_users: (entry.monthly_active_chat_users as number) ?? null,
          daily_active_cli_users: (entry.daily_active_cli_users as number) ?? null,
          daily_active_copilot_cloud_agent_users: (entry.daily_active_copilot_cloud_agent_users as number) ?? null,
          weekly_active_copilot_cloud_agent_users: (entry.weekly_active_copilot_cloud_agent_users as number) ?? null,
          monthly_active_copilot_cloud_agent_users: (entry.monthly_active_copilot_cloud_agent_users as number) ?? null,
          code_acceptance_activity_count: (entry.code_acceptance_activity_count as number) ?? null,
          code_generation_activity_count: (entry.code_generation_activity_count as number) ?? null,
          user_initiated_interaction_count: (entry.user_initiated_interaction_count as number) ?? null,
          loc_suggested_to_add_sum: (entry.loc_suggested_to_add_sum as number) ?? null,
          loc_suggested_to_delete_sum: (entry.loc_suggested_to_delete_sum as number) ?? null,
          loc_added_sum: (entry.loc_added_sum as number) ?? null,
          loc_deleted_sum: (entry.loc_deleted_sum as number) ?? null,
          pull_requests: entry.pull_requests ?? null,
          totals_by_feature: entry.totals_by_feature ?? null,
          totals_by_ide: entry.totals_by_ide ?? null,
          totals_by_language_feature: entry.totals_by_language_feature ?? null,
          totals_by_language_model: entry.totals_by_language_model ?? null,
          totals_by_model_feature: entry.totals_by_model_feature ?? null,
          totals_by_cli: entry.totals_by_cli ?? null,
          raw_data: entry,
        });
      }
    }
  }

  // Save raw dump
  const dir = path.join('data', 'raw', 'copilot-org-metrics');
  await fs.mkdir(dir, { recursive: true });
  const today = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
  await fs.writeFile(path.join(dir, `${today}.json`), JSON.stringify(allRecords, null, 2));

  return allRecords;
}
