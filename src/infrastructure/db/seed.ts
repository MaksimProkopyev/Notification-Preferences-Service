import { loadConfig } from '../config.js';
import { createLogger } from '../logger.js';
import {
  PostgresPolicyRepository,
  PostgresPreferencesRepository,
  PostgresUserRepository,
} from '../repositories/PostgresRepositories.js';
import { createDb } from './connection.js';

/**
 * Seeds two demo users and one global policy (marketing_sms denied in EU).
 * Idempotent: re-running does not create duplicates.
 */
async function run(): Promise<void> {
  const config = loadConfig();
  const logger = createLogger(config.logLevel);
  const db = createDb(config.databaseUrl);

  const users = new PostgresUserRepository(db);
  const prefs = new PostgresPreferencesRepository(db);
  const policies = new PostgresPolicyRepository(db);

  await users.ensureExists('user-1');
  await users.ensureExists('user-2');

  // user-2 opts out of marketing email and sets quiet hours (wraps midnight).
  await prefs.upsertOverrides('user-2', [
    { notificationType: 'marketing_email', channel: 'email', enabled: false },
  ]);
  await prefs.setQuietHours('user-2', {
    start: '22:00',
    end: '08:00',
    timezone: 'Europe/Moscow',
  });

  const policy = await policies.create({
    notificationType: 'marketing_sms',
    channel: null, // all channels
    region: 'EU',
  });

  logger.info({ policyId: policy.id }, 'seed_complete');
  await db.destroy();
  console.log('seed complete');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
