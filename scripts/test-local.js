import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { createServer } from 'node:net';
import { localPostgres } from './local-postgres.js';

const listener = createServer();
await new Promise(resolve => listener.listen(0, '127.0.0.1', resolve));
const port = listener.address().port;
await new Promise(resolve => listener.close(resolve));
const directory = await mkdtemp('/tmp/hosh-test-');
const { db, url } = await localPostgres({ directory, port });
try {
  await db.createDatabase('hosh_test');
  const child = spawn(process.execPath, ['--test', '--test-concurrency=1', 'test/integration.test.js'], { stdio: 'inherit', env: { ...process.env, NODE_ENV: 'test', TEST_DATABASE_URL: `${url}/hosh_test` } });
  process.exitCode = await new Promise((resolve, reject) => { child.on('error', reject); child.on('exit', code => resolve(code ?? 1)); });
} finally { await db.stop(); await rm(directory, { recursive: true, force: true }); }
