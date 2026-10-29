import { randomBytes } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { localPostgres } from "./local-postgres.js";

const { db, url } = await localPostgres();
const client = db.getPgClient();
await client.connect();
try {
  if (
    !(await client.query("SELECT 1 FROM pg_database WHERE datname='hosh_quiz'"))
      .rowCount
  )
    await client.query("CREATE DATABASE hosh_quiz");
} finally {
  await client.end();
}
try {
  await writeFile(
    ".env",
    `DATABASE_URL=${url}/hosh_quiz\nSESSION_SECRET=${randomBytes(48).toString("hex")}\nPORT=3000\nNODE_ENV=development\n`,
    { flag: "wx", mode: 0o600 },
  );
  console.log("Created ignored .env for the local development database.");
} catch (error) {
  if (error.code !== "EEXIST") throw error;
}
console.log(
  "Local PostgreSQL ready on port 55432. Keep this process running; use npm run db:migrate in another terminal.",
);
let stopping = false;
async function stop() {
  if (stopping) return;
  stopping = true;
  await db.stop();
  process.exit(0);
}
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
