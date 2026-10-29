import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(process.env.SMOKE_URL || 'http://127.0.0.1:3000');
  await page.getByRole('heading', { name: 'Good to see you.' }).waitFor();
  await mkdir('test-results', { recursive: true });
  await page.screenshot({ path: 'test-results/login-desktop.png', fullPage: true });
  await page.getByRole('button', { name: 'Create account' }).click();
  const username = `smoke_${Date.now()}`;
  await page.getByLabel('Username', { exact: true }).fill(username);
  await page.getByLabel('Email address').fill(`${username}@example.test`);
  await page.getByLabel('Password', { exact: true }).fill('Browser-test-password-42');
  await page.getByRole('button', { name: 'Start exploring' }).click();
  await page.waitForURL('**/#/catalog');
  await page.reload();
  await page.getByRole('button', { name: 'Log out' }).waitFor();
  await page.getByRole('heading', { name: 'The collections' }).waitFor();
  await page.screenshot({ path: 'test-results/catalog-desktop.png', fullPage: true });
  await page.getByRole('button', { name: 'Take the quiz' }).first().click();
  for (let index = 0; index < 10; index++) {
    await page.locator('.answer-option').first().click();
    await page.getByRole('button', { name: 'Submit answer' }).click();
    if (index < 9) await page.getByText(`QUESTION ${String(index+2).padStart(2,'0')}`, { exact: false }).waitFor();
    if (index === 1) await page.reload();
  }
  await page.getByRole('button', { name: 'Retry quiz' }).waitFor();
  assert.match(await page.locator('.score-circle').innerText(), /\d+%/);
  await page.getByRole('button', { name: 'Retry quiz' }).click();
  await page.getByText('QUESTION 01', { exact: false }).waitFor();
  await page.getByRole('link', { name: 'My history' }).click();
  await page.getByRole('heading', { name: 'Your recent chapters' }).waitFor();
  assert.equal(await page.locator('tbody tr').count(), 1);
  await page.reload();
  await page.locator('tbody tr').first().waitFor();
  await page.getByRole('link', { name: 'Leaderboard', exact: true }).click();
  await page.locator('.leaderboard-table').waitFor();
  await page.getByLabel('View leaderboard').selectOption({ label: 'Basketball · highest score' });
  await page.getByRole('columnheader', { name: 'Best score' }).waitFor();
  await page.getByRole('button', { name: 'Log out' }).click();
  await page.getByRole('heading', { name: 'Good to see you.' }).waitFor();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: 'test-results/login-mobile.png', fullPage: true });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'mobile page must not overflow horizontally');
  assert.deepEqual(errors, []);
  console.log('Browser smoke passed: registration, persisted session, catalog, full quiz with reload, results, retry, logout, mobile width; no page errors.');
} finally { await browser.close(); }
