import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import bcrypt from 'bcrypt';
import { createPool } from '../src/db.js';
import { createApp } from '../src/app.js';
import { migrate } from '../scripts/migrate.js';
import { seed } from '../scripts/seed.js';

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
  await seed(pool);
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

let quizId;
let completedToken;
test('seeds five quizzes with ten valid questions each; seed is repeatable', async () => {
  await seed(pool);
  const response = await player.get('/api/quizzes').expect(200);
  assert.equal(response.body.length, 5); assert.ok(response.body.every(q => q.question_count === 10));
  quizId = response.body[0].id;
  const invalid = await pool.query('SELECT question_id FROM choices GROUP BY question_id HAVING COUNT(*)<>4 OR COUNT(*) FILTER (WHERE is_correct)<>1');
  assert.equal(invalid.rowCount, 0);
  await request(app).get('/api/quizzes').expect(401);
});
test('quiz questions hide keys; validates ownership, choice membership, order, and incomplete attempts', async () => {
  const start = await mutation(player, `/api/quizzes/${quizId}/start`, {}).expect(201);
  const token = start.body.attempt_token;
  const questions = (await player.get(`/api/quizzes/${quizId}/questions?token=${token}`).expect(200)).body;
  assert.equal(questions.length, 10);
  assert.doesNotMatch(JSON.stringify(questions), /is_correct|explanation/);
  await secondPlayer.get(`/api/quizzes/${quizId}/questions?token=${token}`).expect(404);
  await mutation(player, '/api/attempts/complete', { attempt_token: token }).expect(409);
  await mutation(player, '/api/attempts/validate', { attempt_token: token, question_id: questions[0].id, chosen_choice_id: questions[1].choices[0].id }).expect(400);
  await mutation(player, '/api/attempts/validate', { attempt_token: token, question_id: questions[1].id, chosen_choice_id: questions[1].choices[0].id }).expect(409);
  const answer = { attempt_token: token, question_id: questions[0].id, chosen_choice_id: questions[0].choices[0].id };
  await mutation(player, '/api/attempts/validate', answer).expect(200);
  await mutation(player, '/api/attempts/validate', answer).expect(200);
  await mutation(player, '/api/attempts/validate', { ...answer, chosen_choice_id: questions[0].choices[1].id }).expect(409);
  await mutation(player, '/api/attempts/complete', { attempt_token: token }).expect(409);
});
async function completeQuiz(agent, score = 8, selectedQuizId = quizId) {
  const start = await mutation(agent, `/api/quizzes/${selectedQuizId}/start`, {}).expect(201);
  const token = start.body.attempt_token;
  const questions = (await agent.get(`/api/quizzes/${selectedQuizId}/questions?token=${token}`).expect(200)).body;
  for (const [index, question] of questions.entries()) {
    const { rows: [choice] } = await pool.query('SELECT id FROM choices WHERE question_id=$1 AND is_correct=$2 ORDER BY id LIMIT 1', [question.id,index<score]);
    await mutation(agent, '/api/attempts/validate', { attempt_token: token, question_id: question.id, chosen_choice_id: choice.id }).expect(200);
  }
  const response = await mutation(agent, '/api/attempts/complete', { attempt_token: token }).expect(200);
  return { token, result: response.body };
}
test('server computes score and percentage, locks completion, and starts fresh retries', async () => {
  const { token, result } = await completeQuiz(player, 8); completedToken = token;
  assert.equal(result.score, 8); assert.equal(result.total, 10); assert.equal(result.percentage, 80);
  const repeated = await mutation(player, '/api/attempts/complete', { attempt_token: token, score: 10 }).expect(200);
  assert.deepEqual(repeated.body, result);
  const retry = await mutation(player, `/api/quizzes/${quizId}/start`, {}).expect(201);
  assert.notEqual(retry.body.attempt_token, token);
  const questions = (await player.get(`/api/quizzes/${quizId}/questions?token=${retry.body.attempt_token}`)).body;
  assert.ok(questions.every(q => q.selected_choice_id === null));
});

test('history contains only completed attempts belonging to the signed-in player', async () => {
  const history = (await player.get('/api/users/history').expect(200)).body;
  assert.equal(history.length, 1); assert.equal(history[0].score, 8); assert.equal(history[0].percentage, 80);
  assert.equal(history[0].total_questions, 10); assert.ok(!Number.isNaN(Date.parse(history[0].completed_at)));
  await secondPlayer.get('/api/users/history').expect(200, []);
  await request(app).get('/api/users/history').expect(401);
});
test('a completed retry is stored once, including concurrent repeated completion requests', async () => {
  const { token, result } = await completeQuiz(player, 5);
  assert.equal(result.percentage, 50);
  await Promise.all(Array.from({ length: 4 }, () => mutation(player, '/api/attempts/complete', { attempt_token: token }).expect(200)));
  const { rows: [count] } = await pool.query('SELECT COUNT(*)::int AS count FROM attempts WHERE attempt_token=$1', [token]);
  assert.equal(count.count, 1);
  assert.equal((await player.get('/api/users/history')).body.length, 2);
});
test('history persists after logout/login and app recreation', async () => {
  await mutation(player, '/api/auth/logout', {}).expect(200);
  const login = await mutation(player, '/api/auth/login', credentials).expect(200);
  const response = await request(createApp(pool, options)).get('/api/users/history').set('Cookie', login.headers['set-cookie'][0].split(';')[0]).expect(200);
  assert.deepEqual(response.body.map(a => a.score), [5,8]);
});

test('leaderboards group users, use highest score and completed count, and omit private emails', async () => {
  await completeQuiz(secondPlayer, 10);
  const topic = (await player.get(`/api/leaderboard/quiz/${quizId}`).expect(200)).body;
  assert.deepEqual(topic.map(u => [u.username,u.highest_score,u.total_completed_attempts]), [['another_player',10,1],['curious_player',8,2]]);
  const overall = (await player.get('/api/leaderboard/overall').expect(200)).body;
  assert.deepEqual(overall.map(u => [u.username,u.total_completed_attempts]), [['curious_player',2],['another_player',1]]);
  assert.doesNotMatch(JSON.stringify(overall), /email|password/);
  await player.get('/api/leaderboard/quiz/99999').expect(404);
});
test('leaderboard ties follow the specified timestamps deterministically', async () => {
  await completeQuiz(player, 10);
  await completeQuiz(secondPlayer, 7); await completeQuiz(secondPlayer, 6);
  const { rows } = await pool.query("SELECT id,username FROM users WHERE username IN ('curious_player','another_player')");
  for (const u of rows) await pool.query('UPDATE attempts SET completed_at=$1 WHERE user_id=$2', [u.username === 'curious_player' ? '2025-01-01T00:00:00Z' : '2025-01-02T00:00:00Z',u.id]);
  const topic = (await player.get(`/api/leaderboard/quiz/${quizId}`)).body;
  const overall = (await player.get('/api/leaderboard/overall')).body;
  assert.equal(topic[0].username,'curious_player'); assert.equal(overall[0].username,'curious_player');
  assert.equal(topic[0].total_completed_attempts,3); assert.equal(overall[1].total_completed_attempts,3);
});
const newQuestion = quiz => ({ quiz_id: quiz, question_text: 'A synthetic classroom question?', explanation: 'The first choice is correct for this synthetic integration fixture.', choices: ['First','Second','Third','Fourth'].map((choice_text,index) => ({ choice_text,is_correct:index===0 })) });
test('players cannot read or mutate any teacher tools', async () => {
  await player.get('/api/admin/questions').expect(403);
  await mutation(player,'/api/admin/questions',newQuestion(quizId)).expect(403);
  await mutation(player,'/api/admin/questions/1',newQuestion(quizId),'put').expect(403);
  await mutation(player,'/api/admin/questions/1',{},'delete').expect(403);
  await mutation(player,'/api/admin/upload-csv',{preview_token:'fake'}).expect(403);
});
test('teacher adds, edits, reassigns, and deletes questions; validation preserves ten per quiz', async () => {
  const beforeQuestions = (await admin.get('/api/admin/questions').expect(200)).body;
  const first = beforeQuestions.find(q => q.quiz_id === quizId);
  await mutation(admin,`/api/admin/questions/${first.id}`,{},'delete').expect(409);
  await mutation(admin,'/api/admin/questions',{...newQuestion(quizId),choices:[]}).expect(400);
  await mutation(admin,'/api/admin/questions',{...newQuestion(quizId),choices:newQuestion(quizId).choices.map(c=>({...c,is_correct:true}))}).expect(400);
  const added = (await mutation(admin,'/api/admin/questions',newQuestion(quizId)).expect(201)).body;
  const quizzes = (await admin.get('/api/quizzes')).body;
  const target = quizzes.find(q=>q.id!==quizId).id;
  await mutation(admin,`/api/admin/questions/${added.id}`,{...newQuestion(target),question_text:'Edited and reassigned question?'},'put').expect(200);
  const moved = (await admin.get('/api/admin/questions')).body.find(q=>q.id===added.id);
  assert.equal(moved.quiz_id,target); assert.equal(moved.question_text,'Edited and reassigned question?');
  await mutation(admin,`/api/admin/questions/${added.id}`,{},'delete').expect(200);
  assert.equal((await admin.get('/api/admin/questions')).body.length,beforeQuestions.length);
});
test('an in-flight quiz retains its snapshot after a teacher changes an answer', async () => {
  const start = (await mutation(player,`/api/quizzes/${quizId}/start`,{})).body;
  const visible = (await player.get(`/api/quizzes/${quizId}/questions?token=${start.attempt_token}`)).body;
  const original = (await admin.get('/api/admin/questions')).body.find(q=>q.id===visible[0].id);
  const changed = {...original,question_text:'Updated question for future attempts?', choices:original.choices.map((c,index)=>({...c,is_correct:index===0}))};
  await mutation(admin,`/api/admin/questions/${original.id}`,changed,'put').expect(200);
  const unchanged = (await player.get(`/api/quizzes/${quizId}/questions?token=${start.attempt_token}`)).body;
  assert.equal(unchanged[0].question_text,original.question_text); assert.deepEqual(unchanged[0].choices,visible[0].choices);
  await mutation(player,'/api/attempts/validate',{attempt_token:start.attempt_token,question_id:visible[0].id,chosen_choice_id:visible[0].choices[0].id}).expect(200);
  await mutation(admin,`/api/admin/questions/${original.id}`,original,'put').expect(200);
});
test('CSV requires a preview, identifies invalid rows, imports only valid rows, and cannot import twice', async () => {
  const before = (await admin.get('/api/admin/questions')).body.length;
  const csv = 'topic,question_text,choice_a,choice_b,choice_c,choice_d,correct_choice,explanation\nBusiness,"What does a careful preview do, first?",Check rows,Delete users,Skip validation,Guess answers,A,"It checks rows, before saving."\nMissing topic,Bad row,A,B,C,D,E,This should fail.\nSales,Which action is useful?,Listen,Interrupt,Ignore,Guess,A,Listening helps understand the customer.\n';
  const preview = (await admin.post('/api/admin/upload-csv').set('X-Hosh-Request','1').attach('file',Buffer.from(csv),'questions.csv').expect(200)).body;
  assert.equal(preview.valid_count,2); assert.equal(preview.error_count,1); assert.equal(preview.row_errors[0].row,3);
  assert.equal((await admin.get('/api/admin/questions')).body.length,before);
  const imported = (await mutation(admin,'/api/admin/upload-csv',{preview_token:preview.preview_token}).expect(200)).body;
  assert.equal(imported.imported_count,2); assert.equal(imported.error_count,1);
  await mutation(admin,'/api/admin/upload-csv',{preview_token:preview.preview_token}).expect(200,imported);
  assert.equal((await admin.get('/api/admin/questions')).body.length,before+2);
  await admin.post('/api/admin/upload-csv').set('X-Hosh-Request','1').attach('file',Buffer.from('wrong,header\n1,2'),'bad.csv').expect(400);
});
