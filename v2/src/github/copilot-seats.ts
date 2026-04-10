import { Octokit } from '@octokit/rest';
import * as fs from 'fs/promises';
import * as path from 'path';
import { withRateLimitRetry } from './pagination';

export interface CopilotSeatRecord {
  assignee_login: string | null;
  assignee_id: number;
  assignee_type: string | null;
  created_at: string | null;
  updated_at: string | null;
  pending_cancellation_date: string | null;
  last_activity_at: string | null;
  last_activity_editor: string | null;
  plan_type: string | null;
}

export async function fetchCopilotSeats(
  octokit: Octokit,
  org: string
): Promise<CopilotSeatRecord[]> {
  const raw = await withRateLimitRetry(() =>
    octokit.paginate(
      octokit.rest.copilot.listCopilotSeats,
      { org, per_page: 100 },
      (response) => (response.data as any).seats ?? []
    )
  );

  const records: CopilotSeatRecord[] = (raw as any[]).map((seat: any) => ({
    assignee_login: seat.assignee?.login ?? seat.assignee_login,
    assignee_id: seat.assignee?.id ?? seat.assignee_id,
    assignee_type: seat.assignee?.type ?? null,
    created_at: seat.created_at ?? null,
    updated_at: seat.updated_at ?? null,
    pending_cancellation_date: seat.pending_cancellation_date ?? null,
    last_activity_at: seat.last_activity_at ?? null,
    last_activity_editor: seat.last_activity_editor ?? null,
    plan_type: seat.plan_type ?? null,
  }));

  const dir = path.join('data', 'raw', 'copilot-seats');
  await fs.mkdir(dir, { recursive: true });
  const today = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
  await fs.writeFile(path.join(dir, `${today}.json`), JSON.stringify(records, null, 2));

  return records;
}
