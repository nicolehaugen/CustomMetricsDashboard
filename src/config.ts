import 'dotenv/config';

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

export const config = {
  github: {
    token: requireEnv('GITHUB_TOKEN'),
    enterprise: requireEnv('GITHUB_ENTERPRISE'),
    org: requireEnv('GITHUB_ORG'),
    repo: requireEnv('GITHUB_REPO'),
  },
  pg: {
    host: process.env.PG_HOST ?? 'localhost',
    port: parseInt(process.env.PG_PORT ?? '5432', 10),
    database: process.env.PG_DATABASE ?? 'metrics',
    user: process.env.PG_USER ?? 'postgres',
    password: process.env.PG_PASSWORD ?? 'postgres',
  },
  port: parseInt(process.env.PORT ?? '3005', 10),
};
