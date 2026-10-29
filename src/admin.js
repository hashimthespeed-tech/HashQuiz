import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import multer from 'multer';
import { parse } from 'csv-parse/sync';
import { requireAdmin } from './auth.js';
import { fail, id, text } from './errors.js';
import { transaction } from './db.js';
import { questionBank } from './quizzes.js';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 1024*1024, files: 1, fields: 2 } });
const headers = ['topic','question_text','choice_a','choice_b','choice_c','choice_d','correct_choice','explanation'];
export function validateQuestion(body) {
  const question = { quiz_id: id(body.quiz_id), question_text: text(body.question_text, 'Question', 2000), explanation: text(body.explanation, 'Explanation', 4000) };
  if (!Array.isArray(body.choices) || body.choices.length !== 4) fail(400, 'Provide exactly four choices.');
  question.choices = body.choices.map((choice, index) => ({ choice_label: 'ABCD'[index], choice_text: text(choice.choice_text, `Choice ${'ABCD'[index]}`, 500), is_correct: choice.is_correct === true }));
  if (new Set(question.choices.map(c => c.choice_text.toLowerCase())).size !== 4) fail(400, 'Each choice must be different.');
  if (question.choices.filter(c => c.is_correct).length !== 1) fail(400, 'Select exactly one correct choice.');
  return question;
}
async function writeChoices(client, questionId, choices) {
  for (const [index, c] of choices.entries()) await client.query('INSERT INTO choices(question_id,choice_label,choice_order,choice_text,is_correct) VALUES($1,$2,$3,$4,$5)', [questionId,c.choice_label,index+1,c.choice_text,c.is_correct]);
}
async function insertQuestion(client, question) {
  const { rows: [created] } = await client.query('INSERT INTO questions(quiz_id,question_text,explanation) VALUES($1,$2,$3) RETURNING id,quiz_id,question_text', [question.quiz_id,question.question_text,question.explanation]);
  await writeChoices(client, created.id, question.choices);
  return created;
}
async function lockQuizzes(client, ids) {
  const uniqueIds = [...new Set(ids)].sort((a,b) => a-b);
  const result = await client.query('SELECT id FROM quizzes WHERE id=ANY($1::int[]) ORDER BY id FOR UPDATE', [uniqueIds]);
  if (result.rowCount !== uniqueIds.length) fail(400, 'Choose an existing quiz.');
}
async function keepMinimum(client, quizId) {
  const { rows: [count] } = await client.query('SELECT COUNT(*)::int AS count FROM questions WHERE quiz_id=$1', [quizId]);
  if (count.count <= 10) fail(409, 'Each quiz must keep at least ten questions. Add a replacement before moving or deleting this question.');
}

export function adminRouter(pool) {
  const router = Router(); router.use(requireAdmin);
  router.get('/questions', async (req, res) => {
    const { rows: quizzes } = await pool.query('SELECT * FROM quizzes ORDER BY id');
    const questions = [];
    for (const quiz of quizzes) questions.push(...(await questionBank(pool, quiz.id)).map(q => ({ ...q, quiz_title: quiz.title })));
    res.json(questions);
  });
  router.post('/questions', async (req, res) => {
    const question = validateQuestion(req.body);
    const created = await transaction(pool, async client => { await lockQuizzes(client, [question.quiz_id]); return insertQuestion(client, question); });
    res.status(201).json(created);
  });
  router.put('/questions/:id', async (req, res) => {
    const questionId = id(req.params.id); const question = validateQuestion(req.body);
    const result = await transaction(pool, async client => {
      const { rows: [previous] } = await client.query('SELECT * FROM questions WHERE id=$1 FOR UPDATE', [questionId]);
      if (!previous) fail(404, 'Question not found.');
      await lockQuizzes(client, [previous.quiz_id,question.quiz_id]);
      if (previous.quiz_id !== question.quiz_id) await keepMinimum(client, previous.quiz_id);
      await client.query('UPDATE questions SET quiz_id=$1,question_text=$2,explanation=$3 WHERE id=$4', [question.quiz_id,question.question_text,question.explanation,questionId]);
      await client.query('DELETE FROM choices WHERE question_id=$1', [questionId]);
      await writeChoices(client, questionId, question.choices);
      return { id: questionId, quiz_id: question.quiz_id, question_text: question.question_text, updated_at: new Date().toISOString() };
    });
    res.json(result);
  });
  router.delete('/questions/:id', async (req, res) => {
    await transaction(pool, async client => {
      const { rows: [question] } = await client.query('SELECT * FROM questions WHERE id=$1 FOR UPDATE', [id(req.params.id)]);
      if (!question) fail(404, 'Question not found.');
      await lockQuizzes(client, [question.quiz_id]); await keepMinimum(client, question.quiz_id);
      await client.query('DELETE FROM questions WHERE id=$1', [question.id]);
    });
    res.json({ message: 'Question deleted' });
  });
  router.post('/upload-csv', upload.single('file'), async (req, res) => {
    if (req.body.preview_token) {
      if (!/^[0-9a-f-]{36}$/i.test(req.body.preview_token)) fail(400, 'Invalid preview token.');
      const result = await transaction(pool, async client => {
        const { rows: [preview] } = await client.query('SELECT * FROM csv_previews WHERE token=$1 AND user_id=$2 FOR UPDATE', [req.body.preview_token,req.user.id]);
        if (!preview) fail(404, 'Preview not found. Upload the CSV again.');
        if (preview.imported_result) return preview.imported_result;
        if (new Date(preview.expires_at) < new Date()) fail(410, 'This preview expired. Upload the CSV again.');
        if (!preview.validated_rows.length) fail(400, 'No valid rows are available to import.');
        await lockQuizzes(client, preview.validated_rows.map(row => row.question.quiz_id));
        for (const row of preview.validated_rows) await insertQuestion(client, row.question);
        const result = { imported_count: preview.validated_rows.length, error_count: preview.row_errors.length, row_errors: preview.row_errors };
        await client.query('UPDATE csv_previews SET imported_result=$1 WHERE token=$2', [JSON.stringify(result),preview.token]);
        return result;
      });
      res.json(result); return;
    }
    if (!req.file) fail(400, 'Choose a CSV file to preview.');
    let records;
    try { records = parse(req.file.buffer, { bom: true, trim: true, skip_empty_lines: true, relax_column_count: true, info: true, max_record_size: 20000 }); }
    catch (error) { fail(400, `CSV could not be read${error.lines ? ` near line ${error.lines}` : ''}. Check quoted fields and commas.`); }
    if (records.length < 2) fail(400, 'CSV must include a header and at least one question.');
    if (records.length > 501) fail(400, 'Upload at most 500 questions at a time.');
    if (JSON.stringify(records[0].record) !== JSON.stringify(headers)) fail(400, `Use the standard CSV header: ${headers.join(',')}`);
    const { rows: quizzes } = await pool.query('SELECT id,title,slug FROM quizzes');
    const valid = []; const rowErrors = []; const rows = [];
    for (const { record, info } of records.slice(1)) {
      const row = info.lines;
      try {
        if (record.length !== headers.length) fail(400, `Expected ${headers.length} columns, found ${record.length}.`);
        const values = Object.fromEntries(headers.map((key,index) => [key,record[index]]));
        const quiz = quizzes.find(q => [q.title.toLowerCase(),q.slug.toLowerCase()].includes(values.topic.toLowerCase()));
        if (!quiz) fail(400, `Unknown topic: ${values.topic}. Use an existing quiz title.`);
        if (!/^[ABCD]$/i.test(values.correct_choice)) fail(400, 'Correct choice must be A, B, C, or D.');
        const question = validateQuestion({ quiz_id: quiz.id, question_text: values.question_text, explanation: values.explanation,
          choices: 'abcd'.split('').map(letter => ({ choice_text: values[`choice_${letter}`], is_correct: values.correct_choice.toLowerCase() === letter })) });
        valid.push({ row, question }); rows.push({ row, topic: quiz.title, question_text: question.question_text, choices: question.choices, explanation: question.explanation, valid: true });
      } catch (error) {
        if (!error.status) throw error;
        rowErrors.push({ row, error: error.message }); rows.push({ row, topic: record[0] || '', question_text: record[1] || '', valid: false, error: error.message });
      }
    }
    const token = randomUUID();
    await pool.query('INSERT INTO csv_previews(token,user_id,validated_rows,row_errors) VALUES($1,$2,$3,$4)', [token,req.user.id,JSON.stringify(valid),JSON.stringify(rowErrors)]);
    res.json({ preview_token: token, valid_count: valid.length, error_count: rowErrors.length, rows, row_errors: rowErrors });
  });
  return router;
}
