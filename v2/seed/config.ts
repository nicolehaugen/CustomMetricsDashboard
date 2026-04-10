export const SEED_CONFIG = {
  users: 20,
  prs: 140,
  deploymentsPerWeek: { min: 2, max: 8 },
  deploymentSuccessRate: 0.85,
  incidentRate: 0.15,
  reworkRate: 0.12,
  copilotSeatCount: 14,
  windowDays: 28,
  environments: ['production', 'staging'] as string[],
  referenceRepo: process.env.SEED_REFERENCE_REPO ?? 'seed/synthetic',
};
