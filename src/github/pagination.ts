import { Octokit } from '@octokit/rest';

const RATE_LIMIT_THRESHOLD = 10;
const BACKOFF_BASE_MS = 1000;
const MAX_RETRIES = 5;

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function withRateLimitRetry<T>(
  fn: () => Promise<T>,
  retries = MAX_RETRIES
): Promise<T> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (error: any) {
      if (error.status === 403 && error.response?.headers?.['x-ratelimit-remaining'] === '0') {
        const resetTime = parseInt(error.response.headers['x-ratelimit-reset'] || '0', 10);
        const now = Math.floor(Date.now() / 1000);
        const waitSeconds = Math.max(resetTime - now, 1);
        console.log(`Rate limited. Waiting ${waitSeconds}s before retry (attempt ${attempt + 1}/${retries})`);
        await sleep(waitSeconds * 1000);
        continue;
      }
      if (error.status === 403 || error.status === 429) {
        const backoff = BACKOFF_BASE_MS * Math.pow(2, attempt);
        console.log(`Rate limited (${error.status}). Backing off ${backoff}ms (attempt ${attempt + 1}/${retries})`);
        await sleep(backoff);
        continue;
      }
      throw error;
    }
  }
  throw new Error(`Failed after ${retries} retries due to rate limiting`);
}

export async function paginatedFetch<T>(
  octokit: Octokit,
  route: string,
  params: Record<string, any>,
  mapFn?: (item: any) => T
): Promise<T[]> {
  let page = 0;
  const results = await withRateLimitRetry(async () => {
    return octokit.paginate(route as any, {
      ...params,
      per_page: 100,
    }, (response: any, done: any) => {
      page++;
      console.log(`  Fetched page ${page} (${response.data.length} items)`);

      const remaining = parseInt(response.headers['x-ratelimit-remaining'] || '100', 10);
      if (remaining < RATE_LIMIT_THRESHOLD) {
        console.log(`  Warning: Only ${remaining} API calls remaining`);
      }

      return response.data;
    });
  });

  if (mapFn) {
    return (results as any[]).map(mapFn);
  }
  return results as T[];
}
