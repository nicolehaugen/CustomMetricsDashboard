import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

describe('seed config', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('uses default referenceRepo when env var is not set', async () => {
    delete process.env.SEED_REFERENCE_REPO;
    const { SEED_CONFIG } = await import('../seed/config');
    expect(SEED_CONFIG.referenceRepo).toBe('octodemo/bootstrap');
  });

  it('uses SEED_REFERENCE_REPO env var when set', async () => {
    process.env.SEED_REFERENCE_REPO = 'myorg/myrepo';
    const { SEED_CONFIG } = await import('../seed/config');
    expect(SEED_CONFIG.referenceRepo).toBe('myorg/myrepo');
  });
});
