import { readdir, readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { createPool, transaction } from '../src/db.js';

export async function migrate(pool) {
  await transaction(pool, async client => {
    await client.query('SELECT pg_advisory_xact_lock(6843201)');
    await client.query('CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW())');
    for (const name of (await readdir(new URL('../migrations/', import.meta.url))).filter(n => n.endsWith('.sql')).sort()) {
      if ((await client.query('SELECT 1 FROM schema_migrations WHERE name=$1', [name])).rowCount) continue;
      await client.query(await readFile(new URL(`../migrations/${name}`, import.meta.url), 'utf8'));
      await client.query('INSERT INTO schema_migrations(name) VALUES ($1)', [name]);
      console.log(`Applied migration ${name}`);
    }
  });
}
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const pool = createPool();
  try { await migrate(pool); } finally { await pool.end(); }
}
