import { Octokit } from '@octokit/rest';
import { withRateLimitRetry } from './pagination';

export async function fetchCopilotSeats(
  octokit: Octokit,
  org: string
): Promise<Record<string, unknown>[]> {
  const raw = await withRateLimitRetry(() =>
    octokit.paginate(
      octokit.rest.copilot.listCopilotSeats,
      { org, per_page: 100 },
      (response) => (response.data as any).seats ?? []
    )
  );

  return (raw as any[]).map((seat: any) => ({
    assignee: seat.assignee ?? null,
    created_at: seat.created_at ?? null,
    updated_at: seat.updated_at ?? null,
    pending_cancellation_date: seat.pending_cancellation_date ?? null,
    last_activity_at: seat.last_activity_at ?? null,
    last_activity_editor: seat.last_activity_editor ?? null,
    plan_type: seat.plan_type ?? null,
  }));
}
