import { EvaluateNotification } from './application/EvaluateNotification.js';
import { GetUserPreferences } from './application/GetUserPreferences.js';
import { UpdateUserPreferences } from './application/UpdateUserPreferences.js';
import type { Logger, Metrics, PolicyRepository } from './application/ports.js';

/**
 * The set of collaborators the HTTP layer needs. Assembling this explicitly
 * (rather than importing singletons inside routes) is what lets integration
 * tests swap in in-memory repositories.
 */
export interface AppDependencies {
  getUserPreferences: GetUserPreferences;
  updateUserPreferences: UpdateUserPreferences;
  evaluateNotification: EvaluateNotification;
  policyRepository: PolicyRepository;
  logger: Logger;
  metrics: Metrics;
}

export interface RepositoryBundle {
  users: import('./application/ports.js').UserRepository;
  prefs: import('./application/ports.js').PreferencesRepository;
  policies: PolicyRepository;
}

/** Wires use-cases from a bundle of repositories. */
export function buildDependencies(
  repos: RepositoryBundle,
  logger: Logger,
  metrics: Metrics,
): AppDependencies {
  return {
    getUserPreferences: new GetUserPreferences(repos.users, repos.prefs),
    updateUserPreferences: new UpdateUserPreferences(repos.users, repos.prefs, logger),
    evaluateNotification: new EvaluateNotification(
      repos.users,
      repos.prefs,
      repos.policies,
      logger,
      metrics,
    ),
    policyRepository: repos.policies,
    logger,
    metrics,
  };
}
