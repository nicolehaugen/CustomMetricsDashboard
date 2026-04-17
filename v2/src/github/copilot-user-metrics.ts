import { Octokit } from '@octokit/rest';
import * as fs from 'fs/promises';
import * as path from 'path';

export interface CopilotUserMetricRecord {
  day: string;
  user_id: number | null;
  user_login: string;
  enterprise_id: string | null;
  organization_id: string | null;
  user_initiated_interaction_count: number | null;
  code_generation_activity_count: number | null;
  code_acceptance_activity_count: number | null;
  loc_suggested_to_add_sum: number | null;
  loc_suggested_to_delete_sum: number | null;
  loc_added_sum: number | null;
  loc_deleted_sum: number | null;
  used_agent: boolean | null;
  used_chat: boolean | null;
  used_cli: boolean | null;
  used_copilot_coding_agent: boolean | null;
  used_copilot_code_review_active: boolean | null;
  used_copilot_code_review_passive: boolean | null;
  used_copilot_coding_agent: boolean | null;
  totals_by_ide: unknown;
  totals_by_feature: unknown;
  totals_by_language_feature: unknown;
  totals_by_language_model: unknown;
  totals_by_model_feature: unknown;
  totals_by_cli: unknown;
  raw_data: Record<string, unknown>;
}

export async function fetchCopilotUserMetrics(
  octokit: Octokit,
  org: string
): Promise<CopilotUserMetricRecord[]> {
  // Step 1: Get download_links using typed request
  const { data: envelope } = await (octokit as any).request(
    'GET /orgs/{org}/copilot/metrics/reports/users-28-day/latest',
    { org, headers: { 'X-GitHub-Api-Version': '2026-03-10' } }
  );
  const downloadLinks: string[] = envelope.download_links ?? [];

  // Step 2: Fetch each signed URL and parse as NDJSON
  const allRecords: CopilotUserMetricRecord[] = [];

  for (const url of downloadLinks) {
    const res = await fetch(url);
    const text = await res.text();

    for (const line of text.split('\n').filter((l: string) => l.trim())) {
      const entry = JSON.parse(line) as Record<string, unknown>;
      allRecords.push({
        day: entry.day as string,
        user_id: (entry.user_id as number) ?? null,
        user_login: entry.user_login as string,
        enterprise_id: (entry.enterprise_id as string) ?? null,
        organization_id: (entry.organization_id as string) ?? null,
        user_initiated_interaction_count: (entry.user_initiated_interaction_count as number) ?? null,
        code_generation_activity_count: (entry.code_generation_activity_count as number) ?? null,
        code_acceptance_activity_count: (entry.code_acceptance_activity_count as number) ?? null,
        loc_suggested_to_add_sum: (entry.loc_suggested_to_add_sum as number) ?? null,
        loc_suggested_to_delete_sum: (entry.loc_suggested_to_delete_sum as number) ?? null,
        loc_added_sum: (entry.loc_added_sum as number) ?? null,
        loc_deleted_sum: (entry.loc_deleted_sum as number) ?? null,
        used_agent: (entry.used_agent as boolean) ?? null,
        used_chat: (entry.used_chat as boolean) ?? null,
        used_cli: (entry.used_cli as boolean) ?? null,
        used_copilot_coding_agent: (entry.used_copilot_coding_agent as boolean) ?? null,
        used_copilot_code_review_active: (entry.used_copilot_code_review_active as boolean) ?? null,
        used_copilot_code_review_passive: (entry.used_copilot_code_review_passive as boolean) ?? null,
        used_copilot_coding_agent: (entry.used_copilot_coding_agent as boolean) ?? null,
        totals_by_ide: entry.totals_by_ide ?? null,
        totals_by_feature: entry.totals_by_feature ?? null,
        totals_by_language_feature: entry.totals_by_language_feature ?? null,
        totals_by_language_model: entry.totals_by_language_model ?? null,
        totals_by_model_feature: entry.totals_by_model_feature ?? null,
        totals_by_cli: entry.totals_by_cli ?? null,
        raw_data: entry,
      });
    }
  }

  // Save raw dump
  const dir = path.join('data', 'raw', 'copilot-user-metrics');
  await fs.mkdir(dir, { recursive: true });
  const today = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
  await fs.writeFile(path.join(dir, `${today}.json`), JSON.stringify(allRecords, null, 2));

  return allRecords;
}
