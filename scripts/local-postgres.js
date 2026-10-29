import EmbeddedPostgres from "embedded-postgres";
import { randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile, access } from "node:fs/promises";
import path from "node:path";

export async function localPostgres({
  directory = ".local/postgres",
  port = 55432,
} = {}) {
  const databaseDir = path.resolve(directory, "data");
  await mkdir(path.resolve(directory), { recursive: true });
  const configPath = path.resolve(directory, "connection.json");
  let config;
  try {
    config = JSON.parse(await readFile(configPath, "utf8"));
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    config = { user: "hosh", password: randomBytes(32).toString("hex") };
    await writeFile(configPath, JSON.stringify(config), {
      mode: 0o600,
      flag: "wx",
    });
  }
  const db = new EmbeddedPostgres({
    ...config,
    databaseDir,
    port,
    persistent: true,
    authMethod: "scram-sha-256",
    postgresFlags: ["-h", "127.0.0.1", "-k", path.resolve(directory)],
    onLog: () => {},
    onError: () => {},
  });
  try {
    await access(path.join(databaseDir, "PG_VERSION"));
  } catch {
    await db.initialise();
  }
  await db.start();
  return {
    db,
    url: `postgresql://${config.user}:${config.password}@127.0.0.1:${port}`,
  };
}
