import { Octokit } from '@octokit/rest';
import { withRateLimitRetry } from './pagination';

export interface CodeScanningAlertRow {
  alert_number: number;
  severity: string | null;
  state: string;
  created_at: string;
  fixed_at: string | null;
  tool_name: string | null;
}

export async function fetchCodeScanningAlerts(
  octokit: Octokit,
  owner: string,
  repo: string,
  since?: Date
): Promise<CodeScanningAlertRow[]> {
  console.log(`Fetching code scanning alerts for ${owner}/${repo}...`);

  try {
    const alerts = await withRateLimitRetry(() =>
      octokit.paginate('GET /repos/{owner}/{repo}/code-scanning/alerts', {
        owner,
        repo,
        per_page: 100,
        sort: 'updated',
        direction: 'desc',
      } as any)
    );

    const results: CodeScanningAlertRow[] = (alerts as any[])
      .filter((alert: any) => {
        if (since) {
          const updatedAt = new Date(alert.updated_at || alert.created_at);
          return updatedAt >= since;
        }
        return true;
      })
      .map((alert: any) => ({
        alert_number: alert.number,
        severity: alert.rule?.security_severity_level || alert.rule?.severity || null,
        state: alert.state,
        created_at: alert.created_at,
        fixed_at: alert.fixed_at || null,
        tool_name: alert.tool?.name || null,
      }));

    console.log(`  Found ${results.length} code scanning alerts`);
    return results;
  } catch (error: any) {
    if (error.status === 404) {
      console.log('  Code scanning not enabled for this repository, skipping');
      return [];
    }
    throw error;
  }
}
