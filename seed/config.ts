export const SEED_CONFIG = {
  referenceRepo: 'octodemo/bootstrap',
  timeRange: {
    startDays: 90,
    endDate: 'now' as const,
  },
  counts: {
    users: 18,
    pullRequests: 120,
    deploymentsPerWeek: { min: 2, max: 8 },
    incidentRatio: 0.15,
    hotfixRatio: 0.12,
    copilotActiveRatio: 0.70,
  },
  environments: ['production', 'staging'] as const,
  expectedMetrics: {
    deploymentFrequency: '3-6/week',
    changeLeadTime: '2-24 hours',
    changeFailRate: '10-20%',
    failedDeploymentRecoveryTime: '0.5-12 hours',
    deploymentReworkRate: '8-15%',
  },
};
