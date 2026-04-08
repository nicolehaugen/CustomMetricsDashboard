import { Octokit } from '@octokit/rest';
import { config } from '../config';

export function createOctokitClient(): Octokit {
  return new Octokit({
    auth: config.github.token,
  });
}
