import { Octokit } from '@octokit/rest';

export async function fetchCopilotOrganizationMetrics(
  octokit: Octokit,
  org: string
): Promise<Record<string, unknown>[]> {
  const { data: envelope } = await (octokit as any).request(
    'GET /orgs/{org}/copilot/metrics/reports/organization-28-day/latest',
    { org, headers: { 'X-GitHub-Api-Version': '2026-03-10' } }
  );
  const downloadLinks: string[] = (envelope as any).download_links ?? [];

  const allRecords: Record<string, unknown>[] = [];
  for (const url of downloadLinks) {
    const res = await fetch(url);
    const text = await res.text();
    for (const line of text.split('\n').filter((l: string) => l.trim())) {
      const obj = JSON.parse(line) as Record<string, unknown>;
      const dayTotals = (obj.day_totals as Record<string, unknown>[]) ?? [obj];
      for (const entry of dayTotals) {
        // Stamp organization_id so insert always populates the column even if
        // the API response uses a nested or different field.
        if (!entry.organization_id) {
          entry.organization_id = org;
        }
        allRecords.push(entry);
      }
    }
  }
  return allRecords;
}
