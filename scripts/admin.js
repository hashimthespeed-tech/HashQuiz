import bcrypt from "bcrypt";
import { createPool } from "../src/db.js";
import { password } from "../src/auth.js";

const username = process.env.INITIAL_ADMIN_USERNAME;
if (!username || !/^[A-Za-z0-9_-]{3,30}$/.test(username))
  throw new Error("Set a valid INITIAL_ADMIN_USERNAME.");
const hash = await bcrypt.hash(
  password(process.env.INITIAL_ADMIN_PASSWORD),
  12,
);
const email =
  process.env.INITIAL_ADMIN_EMAIL || `${username.toLowerCase()}@admin.local`;
const pool = createPool();
try {
  const {
    rows: [existing],
  } = await pool.query(
    "SELECT role FROM users WHERE lower(username)=lower($1)",
    [username],
  );
  if (existing && existing.role !== "admin")
    throw new Error(
      "This username belongs to a player. Choose a different admin username.",
    );
  if (!existing)
    await pool.query(
      "INSERT INTO users(username,email,password_hash,role) VALUES($1,$2,$3,'admin')",
      [username, email, hash],
    );
  console.log(
    existing
      ? "Admin already exists; password left unchanged."
      : "Admin provisioned. Remove INITIAL_ADMIN_PASSWORD from your environment.",
  );
} finally {
  await pool.end();
}
