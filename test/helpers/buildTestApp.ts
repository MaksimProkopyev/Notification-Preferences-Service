import { buildServer } from '../../src/api/server.js';
import { buildDependencies } from '../../src/container.js';
import type { Logger, Metrics } from '../../src/application/ports.js';
import {
  InMemoryPolicyRepository,
  InMemoryPreferencesRepository,
  InMemoryUserRepository,
} from '../../src/infrastructure/repositories/InMemoryRepositories.js';

export const noopLogger: Logger = {
  info: () => {},
  warn: () => {},
  error: () => {},
};

export const noopMetrics: Metrics = {
  increment: () => {},
  timing: () => {},
};

export function buildTestApp() {
  const users = new InMemoryUserRepository();
  const prefs = new InMemoryPreferencesRepository();
  const policies = new InMemoryPolicyRepository();
  const deps = buildDependencies({ users, prefs, policies }, noopLogger, noopMetrics);
  const app = buildServer(deps);
  return { app, users, prefs, policies };
}
