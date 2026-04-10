import { Octokit } from '@octokit/rest';
import { config } from '../config';

export function createOctokit(): Octokit {
  return new Octokit({
    auth: config.github.token,
    request: {
      timeout: 30000,
    },
  });
}
