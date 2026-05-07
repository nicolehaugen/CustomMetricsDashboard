import { Octokit } from '@octokit/rest';

export async function fetchCopilotUserMetrics(
  octokit: Octokit,
  enterprise: string
): Promise<Record<string, unknown>[]> {
  const { data: envelope } = await (octokit as any).request(
    'GET /enterprises/{enterprise}/copilot/metrics/reports/users-28-day/latest',
    { enterprise, headers: { 'X-GitHub-Api-Version': '2026-03-10' } }
  );
  const downloadLinks: string[] = (envelope as any).download_links ?? [];

  const allRecords: Record<string, unknown>[] = [];
  for (const url of downloadLinks) {
    const res = await fetch(url);
    const text = await res.text();
    for (const line of text.split('\n').filter((l: string) => l.trim())) {
      const entry = JSON.parse(line) as Record<string, unknown>;
      const userObj = entry.user as Record<string, unknown> | null;
      allRecords.push({
        ...entry,
        user_login: userObj?.login as string ?? entry.user_login as string ?? null,
      });
    }
  }
  return allRecords;
}
