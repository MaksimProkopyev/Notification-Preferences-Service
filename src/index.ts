import { buildServer } from './api/server.js';
import { buildDependencies } from './container.js';
import { loadConfig } from './infrastructure/config.js';
import { createDb } from './infrastructure/db/connection.js';
import { createLogger, createMetrics } from './infrastructure/logger.js';
import {
  PostgresPolicyRepository,
  PostgresPreferencesRepository,
  PostgresUserRepository,
} from './infrastructure/repositories/PostgresRepositories.js';

async function main(): Promise<void> {
  const config = loadConfig();
  const logger = createLogger(config.logLevel);
  const metrics = createMetrics(logger);
  const db = createDb(config.databaseUrl);

  const deps = buildDependencies(
    {
      users: new PostgresUserRepository(db),
      prefs: new PostgresPreferencesRepository(db),
      policies: new PostgresPolicyRepository(db),
    },
    logger,
    metrics,
  );

  const app = buildServer(deps);

  const shutdown = async (signal: string): Promise<void> => {
    logger.info({ signal }, 'shutting_down');
    await app.close();
    await db.destroy();
    process.exit(0);
  };
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));

  await app.listen({ port: config.port, host: config.host });
  logger.info({ port: config.port, host: config.host }, 'server_listening');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
