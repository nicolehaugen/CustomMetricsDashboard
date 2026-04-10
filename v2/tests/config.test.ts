import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const originalEnv = { ...process.env };

beforeEach(() => {
  vi.resetModules();
  process.env = { ...originalEnv };
});

afterEach(() => {
  process.env = originalEnv;
});

function setRequiredEnv() {
  process.env.GITHUB_TOKEN = 'test-token';
  process.env.GITHUB_ORG = 'test-org';
  process.env.GITHUB_REPO = 'test-repo';
  process.env.PG_HOST = 'localhost';
  process.env.PG_DATABASE = 'testdb';
  process.env.PG_USER = 'testuser';
  process.env.PG_PASSWORD = 'testpass';
}

describe('config', () => {
  it('throws on missing GITHUB_TOKEN', async () => {
    setRequiredEnv();
    delete process.env.GITHUB_TOKEN;
    await expect(() => import('../src/config')).rejects.toThrow('GITHUB_TOKEN');
  });

  it('throws on missing GITHUB_ORG', async () => {
    setRequiredEnv();
    delete process.env.GITHUB_ORG;
    await expect(() => import('../src/config')).rejects.toThrow('GITHUB_ORG');
  });

  it('throws on missing GITHUB_REPO', async () => {
    setRequiredEnv();
    delete process.env.GITHUB_REPO;
    await expect(() => import('../src/config')).rejects.toThrow('GITHUB_REPO');
  });

  it('throws on missing PG_HOST', async () => {
    setRequiredEnv();
    delete process.env.PG_HOST;
    await expect(() => import('../src/config')).rejects.toThrow('PG_HOST');
  });

  it('loads valid config when all vars present', async () => {
    setRequiredEnv();
    const { config } = await import('../src/config');
    expect(config.github.token).toBe('test-token');
    expect(config.github.org).toBe('test-org');
    expect(config.github.repo).toBe('test-repo');
    expect(config.pg.host).toBe('localhost');
  });

  it('DATA_MODE defaults to "live"', async () => {
    setRequiredEnv();
    delete process.env.DATA_MODE;
    const { config } = await import('../src/config');
    expect(config.dataMode).toBe('live');
  });

  it('DATA_MODE can be set to "seed"', async () => {
    setRequiredEnv();
    process.env.DATA_MODE = 'seed';
    const { config } = await import('../src/config');
    expect(config.dataMode).toBe('seed');
  });

  it('DATA_SOURCE_LABEL is read from env', async () => {
    setRequiredEnv();
    process.env.DATA_SOURCE_LABEL = 'my-org/my-repo';
    const { config } = await import('../src/config');
    expect(config.dataSourceLabel).toBe('my-org/my-repo');
  });
});
