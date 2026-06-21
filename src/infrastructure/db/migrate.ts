import { readFile, readdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { loadConfig } from '../config.js';

/**
 * Minimal forward-only migration runner: executes every *.sql file in
 * /migrations in lexical order, tracking applied files in a _migrations table
 * so re-runs are idempotent. Kept intentionally tiny — no rollback/down logic,
 * which is appropriate for this scope (see README for production notes).
 */
const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = join(__dirname, '../../../migrations');

async function run(): Promise<void> {
  const { databaseUrl } = loadConfig();
  const pool = new pg.Pool({ connectionString: databaseUrl });

  await pool.query(
    `CREATE TABLE IF NOT EXISTS _migrations (
       name TEXT PRIMARY KEY,
       applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
     )`,
  );

  const files = (await readdir(MIGRATIONS_DIR)).filter((f) => f.endsWith('.sql')).sort();
  for (const file of files) {
    const applied = await pool.query('SELECT 1 FROM _migrations WHERE name = $1', [file]);
    if (applied.rowCount && applied.rowCount > 0) {
      console.log(`skip   ${file}`);
      continue;
    }
    const sql = await readFile(join(MIGRATIONS_DIR, file), 'utf8');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('INSERT INTO _migrations(name) VALUES ($1)', [file]);
      await client.query('COMMIT');
      console.log(`apply  ${file}`);
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  await pool.end();
  console.log('migrations complete');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
