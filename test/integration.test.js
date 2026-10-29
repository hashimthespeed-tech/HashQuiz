import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import bcrypt from 'bcrypt';
import { createPool } from '../src/db.js';
import { createApp } from '../src/app.js';
import { migrate } from '../scripts/migrate.js';

if (!process.env.TEST_DATABASE_URL || !new URL(process.env.TEST_DATABASE_URL).pathname.endsWith('_test')) throw new Error('Tests require a separate TEST_DATABASE_URL with a database name ending in _test.');
const pool = createPool(process.env.TEST_DATABASE_URL);
const options = { sessionSecret: 'test-only-session-secret-at-least-32-characters' };
const app = createApp(pool, options);
const player = request.agent(app);
const secondPlayer = request.agent(app);
const admin = request.agent(app);
const credentials = { username: 'curious_player', email: 'player@example.test', password: 'Curious-test-password-42' };
const mutation = (agent, path, body, method = 'post') => agent[method](path).set('X-Hosh-Request', '1').send(body);
before(async () => {
  await migrate(pool);
  const hash = await bcrypt.hash('Admin-test-password-42', 12);
  await pool.query("INSERT INTO users(username,email,password_hash,role) VALUES('teacher','teacher@example.test',$1,'admin')", [hash]);
});
after(async () => { await pool.end(); });

test('server serves SPA and PostgreSQL health check', async () => {
  await request(app).get('/').expect(200).expect(/Hosh Quiz/);
  await request(app).get('/api/health').expect(200, { status: 'ok' });
});
test('registers a player; hashes the password and uses protected session cookies', async () => {
  const response = await mutation(player, '/api/auth/register', credentials).expect(201);
  assert.equal(response.body.role, 'player'); assert.equal(response.body.password_hash, undefined);
  assert.match(response.headers['set-cookie'][0], /HttpOnly/); assert.match(response.headers['set-cookie'][0], /SameSite=Lax/);
  const { rows: [user] } = await pool.query('SELECT * FROM users WHERE username=$1', [credentials.username]);
  assert.match(user.password_hash, /^\$2[aby]\$12\$/); assert.ok(await bcrypt.compare(credentials.password, user.password_hash));
});
test('rejects invalid registration, duplicate identities, and injected roles', async () => {
  await mutation(request(app), '/api/auth/register', { ...credentials, role: 'admin' }).expect(400);
  await mutation(request(app), '/api/auth/register', { ...credentials, username: 'x' }).expect(400);
  await mutation(request(app), '/api/auth/register', { ...credentials, email: 'bad-email' }).expect(400);
  await mutation(request(app), '/api/auth/register', { ...credentials, username: credentials.username.toUpperCase() }).expect(409);
});
test('rejects invalid login and cross-origin mutations', async () => {
  const response = await mutation(request(app), '/api/auth/login', { username: credentials.username, password: 'Wrong-test-password-42' }).expect(401);
  assert.equal(response.body.password, undefined);
  await request(app).post('/api/auth/login').send(credentials).expect(403);
  await mutation(request(app), '/api/auth/login', credentials).set('Origin', 'https://untrusted.example').expect(403);
});
test('protects admin actions; login and session storage survive a new app instance', async () => {
  await request(app).get('/api/admin/status').expect(401);
  await player.get('/api/admin/status').expect(403);
  const login = await mutation(admin, '/api/auth/login', { username: 'teacher', password: 'Admin-test-password-42' }).expect(200);
  await admin.get('/api/admin/status').expect(200);
  const cookie = login.headers['set-cookie'][0].split(';')[0];
  await request(createApp(pool, options)).get('/api/auth/me').set('Cookie', cookie).expect(200).expect(res => assert.equal(res.body.user.role, 'admin'));
});
test('logout invalidates the session; valid login restores access', async () => {
  await mutation(player, '/api/auth/logout', {}).expect(200);
  await player.get('/api/auth/me').expect(200, { user: null });
  await mutation(player, '/api/auth/login', credentials).expect(200);
  await player.get('/api/auth/me').expect(200).expect(res => assert.equal(res.body.user.username, credentials.username));
  await mutation(secondPlayer, '/api/auth/register', { username: 'another_player', email: 'another@example.test', password: credentials.password }).expect(201);
});
