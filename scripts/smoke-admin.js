import { chromium } from "playwright-core";
import { randomBytes } from "node:crypto";
import bcrypt from "bcrypt";
import assert from "node:assert/strict";
import { createPool } from "../src/db.js";

try {
  process.loadEnvFile();
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}
const base = process.env.SMOKE_URL || "http://127.0.0.1:3000";
if (
  process.env.NODE_ENV === "production" ||
  !["127.0.0.1", "localhost"].includes(new URL(base).hostname) ||
  !["127.0.0.1", "localhost"].includes(
    new URL(process.env.DATABASE_URL).hostname,
  )
)
  throw new Error(
    "Admin smoke is for a local development server and database only.",
  );
const pool = createPool();
const suffix = Date.now();
const username = `teacher_${suffix}`;
const password = randomBytes(20).toString("hex");
const hash = await bcrypt.hash(password, 12);
const {
  rows: [user],
} = await pool.query(
  "INSERT INTO users(username,email,password_hash,role) VALUES($1,$2,$3,'admin') RETURNING id",
  [username, `${username}@example.test`, hash],
);
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
  headless: true,
  args: ["--no-sandbox"],
});
let page;
try {
  page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.setDefaultTimeout(8000);
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(base);
  await page.getByLabel("Username", { exact: true }).fill(username);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Welcome back" }).click();
  await page.getByRole("link", { name: "Teacher’s desk" }).click();
  await page.getByRole("button", { name: "Add a question" }).click();
  const dialog = page.getByRole("dialog");
  const title = `Browser check ${suffix}`;
  await dialog.getByLabel("Question", { exact: true }).fill(title);
  for (const [index, letter] of ["A", "B", "C", "D"].entries())
    await dialog
      .getByLabel(`Choice ${letter}`, { exact: true })
      .fill(`Choice number ${index + 1}`);
  await dialog.getByRole("radio").first().check();
  await dialog
    .getByLabel("Explanation", { exact: true })
    .fill(
      "The first choice is the correct answer in this local browser fixture.",
    );
  await dialog.getByRole("button", { name: "Save question" }).click();
  await page
    .getByRole("row")
    .filter({ hasText: title })
    .getByRole("button", { name: "Edit" })
    .click();
  await dialog.getByRole("combobox").selectOption({ label: "Football" });
  await dialog.getByLabel("Question", { exact: true }).fill(`${title} edited`);
  await dialog.getByRole("button", { name: "Save question" }).click();
  const edited = page.getByRole("row").filter({ hasText: `${title} edited` });
  await edited.waitFor();
  assert.match(await edited.innerText(), /Football/);
  await edited.getByRole("button", { name: "Edit" }).click();
  page.once("dialog", (event) => event.accept());
  await dialog.getByRole("button", { name: "Delete question" }).click();
  await dialog.waitFor({ state: "hidden" });
  await page.getByRole("button", { name: "Import CSV", exact: true }).click();
  const csvTitle = `CSV browser check ${suffix}`;
  const csv = `topic,question_text,choice_a,choice_b,choice_c,choice_d,correct_choice,explanation\nBusiness,${csvTitle},Yes,No,Maybe,Never,A,The first choice is correct for this fixture.\nUnknown,Invalid fixture,One,Two,Three,Four,Z,This row must be rejected.\n`;
  await page
    .locator("#csv-file")
    .setInputFiles({
      name: "browser-check.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(csv),
    });
  await page.getByRole("button", { name: "Preview questions" }).click();
  await page.getByText("1 valid · 1 invalid", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Import 1 valid question" }).click();
  await page
    .getByText("Imported 1 question. 1 invalid row skipped.", { exact: true })
    .waitFor();
  await page.screenshot({
    path: "test-results/admin-csv-desktop.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Question library" }).click();
  await page
    .getByRole("row")
    .filter({ hasText: csvTitle })
    .getByRole("button", { name: "Edit" })
    .click();
  page.once("dialog", (event) => event.accept());
  await dialog.getByRole("button", { name: "Delete question" }).click();
  await dialog.waitFor({ state: "hidden" });
  await page.setViewportSize({ width: 390, height: 844 });
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  assert.deepEqual(errors, []);
  console.log(
    "Admin browser smoke passed: add, edit, reassign, delete, CSV preview/invalid row/import, mobile width; no page errors.",
  );
} catch (error) {
  await page?.screenshot({
    path: "test-results/admin-failure.png",
    fullPage: true,
  });
  throw error;
} finally {
  await browser.close();
  await pool.query("DELETE FROM csv_previews WHERE user_id=$1", [user.id]);
  await pool.query("DELETE FROM users WHERE id=$1", [user.id]);
  await pool.end();
}
