import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

describe('config', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('throws on missing GITHUB_TOKEN', async () => {
    delete process.env.GITHUB_TOKEN;
    await expect(() => import('../src/config')).rejects.toThrow('GITHUB_TOKEN');
  });

  it('throws on missing PG_HOST', async () => {
    process.env.GITHUB_TOKEN = 'test-token';
    process.env.GITHUB_ORG = 'test-org';
    process.env.GITHUB_REPO = 'test-repo';
    delete process.env.PG_HOST;
    await expect(() => import('../src/config')).rejects.toThrow('PG_HOST');
  });

  it('returns valid config when all vars present', async () => {
    process.env.GITHUB_TOKEN = 'ghp_test';
    process.env.GITHUB_ORG = 'test-org';
    process.env.GITHUB_REPO = 'test-repo';
    process.env.PG_HOST = 'localhost';
    process.env.PG_PORT = '5432';
    process.env.PG_DATABASE = 'test_db';
    process.env.PG_USER = 'user';
    process.env.PG_PASSWORD = 'pass';
    const { config } = await import('../src/config');
    expect(config.github.token).toBe('ghp_test');
    expect(config.github.org).toBe('test-org');
    expect(config.pg.host).toBe('localhost');
    expect(config.port).toBe(3001);
  });
});
