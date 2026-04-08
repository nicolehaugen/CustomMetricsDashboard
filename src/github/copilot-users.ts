import { Octokit } from '@octokit/rest';
import { withRateLimitRetry } from './pagination';

export interface CopilotUserActivityRow {
  login: string;
  activity_date: string;
  is_active: boolean;
  metrics_json: Record<string, unknown>;
  last_activity_at: string | null;
  interaction_count: number;
  last_surface: string | null;
  used_coding_agent: boolean;
  used_code_review: boolean;
  completions_count: number;
  chat_interactions: number;
  acceptance_rate: number | null;
}

function formatDate(date: Date): string {
  return date.toISOString().split('T')[0];
}

function getDatesInRange(start: Date, end: Date): Date[] {
  const dates: Date[] = [];
  const current = new Date(start);
  while (current <= end) {
    dates.push(new Date(current));
    current.setDate(current.getDate() + 1);
  }
  return dates;
}

export async function fetchCopilotUserActivity(
  octokit: Octokit,
  org: string,
  since?: Date
): Promise<CopilotUserActivityRow[]> {
  console.log(`Fetching Copilot user activity for ${org}...`);

  const end = new Date();
  const start = since || new Date(end.getTime() - 28 * 24 * 60 * 60 * 1000);
  const dates = getDatesInRange(start, end);

  const results: CopilotUserActivityRow[] = [];

  for (const date of dates) {
    const day = formatDate(date);
    try {
      const response = await withRateLimitRetry(() =>
        octokit.request('GET /orgs/{org}/copilot/metrics/reports/users-1-day', {
          org,
          day,
        } as any)
      );

      const users = (response.data as any[]) || [];
      for (const user of users) {
        const interactionCount = user.user_initiated_interaction_count ?? 0;
        results.push({
          login: user.login || user.github_login || '',
          activity_date: day,
          is_active: interactionCount > 0,
          metrics_json: user,
          last_activity_at: user.last_activity_at || null,
          interaction_count: interactionCount,
          last_surface: user.last_surface_used || null,
          used_coding_agent: user.used_copilot_coding_agent ?? false,
          used_code_review: user.used_copilot_code_review ?? false,
          completions_count: user.completions_count ?? user.total_code_completions ?? 0,
          chat_interactions: user.chat_interactions ?? user.total_chat_turns ?? 0,
          acceptance_rate: user.acceptance_rate ?? null,
        });
      }

      console.log(`  ${day}: ${users.length} active users`);
    } catch (error: any) {
      if (error.status === 404 || error.status === 403) {
        console.log(`  ${day}: Copilot metrics not available (${error.status}), skipping`);
        continue;
      }
      throw error;
    }
  }

  console.log(`  Total: ${results.length} user-day activity records`);
  return results;
}
