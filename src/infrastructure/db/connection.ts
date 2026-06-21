import { Kysely, PostgresDialect } from 'kysely';
import pg from 'pg';
import type { Database } from './schema.js';

/**
 * Postgres stores TIME columns; make `time` come back as the raw "HH:mm[:ss]"
 * string instead of a Date, so quiet-hours strings round-trip cleanly.
 */
pg.types.setTypeParser(1083 /* TIME */, (v) => v);

export function createDb(databaseUrl: string): Kysely<Database> {
  const pool = new pg.Pool({ connectionString: databaseUrl });
  return new Kysely<Database>({ dialect: new PostgresDialect({ pool }) });
}

export type DB = Kysely<Database>;
