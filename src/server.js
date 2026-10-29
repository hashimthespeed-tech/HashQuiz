import { createApp } from './app.js';
import { createPool } from './db.js';

const pool = createPool();
await pool.query('SELECT 1');
const app = createApp(pool);
const server = app.listen(Number(process.env.PORT || 3000), '0.0.0.0', () => console.log(`Hosh Quiz is listening on port ${process.env.PORT || 3000}`));
async function close() { server.close(async () => { await pool.end(); process.exit(0); }); }
process.on('SIGTERM', close);
process.on('SIGINT', close);
