const RATE_LIMIT_DELAY_MS = 60_000;
const MAX_RETRIES = 3;

export async function withRateLimitRetry<T>(fn: () => Promise<T>): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await fn();
    } catch (err: any) {
      if (err?.status === 403 && err?.response?.headers?.['x-ratelimit-remaining'] === '0') {
        const resetAt = parseInt(err.response.headers['x-ratelimit-reset'] ?? '0', 10) * 1000;
        const delay = Math.max(resetAt - Date.now(), RATE_LIMIT_DELAY_MS);
        console.warn(`Rate limited. Waiting ${Math.ceil(delay / 1000)}s before retry ${attempt + 1}/${MAX_RETRIES}`);
        await sleep(delay);
        lastError = err;
        continue;
      }
      if (attempt < MAX_RETRIES) {
        const delay = Math.pow(2, attempt) * 1000;
        await sleep(delay);
        lastError = err;
        continue;
      }
      throw err;
    }
  }
  throw lastError;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
