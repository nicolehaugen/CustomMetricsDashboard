import dotenv from 'dotenv';
dotenv.config();

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const config = {
  github: {
    token: process.env.GITHUB_TOKEN || process.env.GH_TOKEN || requireEnv('GITHUB_TOKEN'),
    org: requireEnv('GITHUB_ORG'),
    repo: requireEnv('GITHUB_REPO'),
  },
  pg: {
    host: requireEnv('PG_HOST'),
    port: parseInt(process.env.PG_PORT || '5432', 10),
    database: requireEnv('PG_DATABASE'),
    user: requireEnv('PG_USER'),
    password: requireEnv('PG_PASSWORD'),
  },
  port: parseInt(process.env.PORT || '3001', 10),
};
