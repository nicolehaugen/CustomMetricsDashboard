import { describe, it, expect } from 'vitest';
import { SEED_CONFIG } from '../seed/config';

describe('SEED_CONFIG', () => {
  it('windowDays is 28', () => {
    expect(SEED_CONFIG.windowDays).toBe(28);
  });

  it('copilotSeatCount is less than users', () => {
    expect(SEED_CONFIG.copilotSeatCount).toBeLessThan(SEED_CONFIG.users);
  });

  it('copilotSeatCount is positive', () => {
    expect(SEED_CONFIG.copilotSeatCount).toBeGreaterThan(0);
  });

  it('environments contains production', () => {
    expect(SEED_CONFIG.environments).toContain('production');
  });

  it('deploymentSuccessRate is between 0 and 1', () => {
    expect(SEED_CONFIG.deploymentSuccessRate).toBeGreaterThan(0);
    expect(SEED_CONFIG.deploymentSuccessRate).toBeLessThan(1);
  });
});
