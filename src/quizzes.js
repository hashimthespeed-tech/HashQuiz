import { Router } from "express";
import { randomUUID } from "node:crypto";
import { requireAuth } from "./auth.js";
import { fail, id } from "./errors.js";
import { transaction } from "./db.js";

export async function questionBank(client, quizId) {
  const { rows } = await client.query(
    `SELECT q.id,q.quiz_id,q.question_text,q.explanation,
    json_agg(json_build_object('id',c.id,'choice_label',c.choice_label,'choice_text',c.choice_text,'is_correct',c.is_correct) ORDER BY c.choice_order) AS choices
    FROM questions q JOIN choices c ON c.question_id=q.id WHERE q.quiz_id=$1 GROUP BY q.id ORDER BY q.id`,
    [quizId],
  );
  return rows;
}
export async function getAttempt(client, token, userId, lock = false) {
  if (
    typeof token !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      token,
    )
  )
    fail(400, "Invalid attempt token.");
  const {
    rows: [attempt],
  } = await client.query(
    `SELECT * FROM quiz_sessions WHERE token=$1 AND user_id=$2${lock ? " FOR UPDATE" : ""}`,
    [token, userId],
  );
  if (!attempt) fail(404, "Quiz attempt not found.");
  if (!attempt.completed_result && new Date(attempt.expires_at) < new Date())
    fail(410, "This attempt has expired. Please start a new quiz.");
  return attempt;
}
export function quizRouter(pool) {
  const router = Router();
  router.use(requireAuth);
  router.get("/quizzes", async (req, res) => {
    const { rows } = await pool.query(
      "SELECT z.*,COUNT(q.id)::int AS question_count FROM quizzes z LEFT JOIN questions q ON q.quiz_id=z.id GROUP BY z.id ORDER BY z.id",
    );
    res.json(rows);
  });
  router.post("/quizzes/:id/start", async (req, res) => {
    const quizId = id(req.params.id);
    if (
      !(await pool.query("SELECT 1 FROM quizzes WHERE id=$1", [quizId]))
        .rowCount
    )
      fail(404, "Quiz not found.");
    const questions = (await questionBank(pool, quizId)).slice(0, 10);
    if (
      questions.length < 10 ||
      questions.some(
        (q) =>
          q.choices.length !== 4 ||
          q.choices.filter((c) => c.is_correct).length !== 1,
      )
    )
      fail(
        409,
        "This quiz needs at least ten valid questions before it can be played.",
      );
    const token = randomUUID();
    await pool.query(
      "INSERT INTO quiz_sessions(token,user_id,quiz_id,question_snapshot) VALUES($1,$2,$3,$4)",
      [token, req.user.id, quizId, JSON.stringify(questions)],
    );
    res
      .status(201)
      .json({ attempt_token: token, total_questions: questions.length });
  });
  router.get("/quizzes/:id/questions", async (req, res) => {
    const attempt = await getAttempt(pool, req.query.token, req.user.id);
    if (attempt.quiz_id !== id(req.params.id))
      fail(404, "Quiz attempt not found.");
    res.json(
      attempt.question_snapshot.map((q) => ({
        id: q.id,
        question_text: q.question_text,
        selected_choice_id: attempt.answers[q.id] ?? null,
        choices: q.choices.map(({ id, choice_label, choice_text }) => ({
          id,
          choice_label,
          choice_text,
        })),
      })),
    );
  });
  router.post("/attempts/validate", async (req, res) => {
    const result = await transaction(pool, async (client) => {
      const attempt = await getAttempt(
        client,
        req.body.attempt_token,
        req.user.id,
        true,
      );
      if (attempt.completed_result)
        fail(409, "This attempt is already complete.");
      const questionId = id(req.body.question_id);
      const choiceId = id(req.body.chosen_choice_id);
      const question = attempt.question_snapshot.find(
        (q) => q.id === questionId,
      );
      if (!question || !question.choices.some((c) => c.id === choiceId))
        fail(400, "Choose an answer belonging to this question.");
      if (
        attempt.answers[questionId] &&
        attempt.answers[questionId] !== choiceId
      )
        fail(409, "This answer is locked.");
      if (
        !attempt.answers[questionId] &&
        attempt.question_snapshot[Object.keys(attempt.answers).length]?.id !==
          questionId
      )
        fail(409, "Answer questions in order.");
      attempt.answers[questionId] = choiceId;
      await client.query("UPDATE quiz_sessions SET answers=$1 WHERE token=$2", [
        JSON.stringify(attempt.answers),
        attempt.token,
      ]);
      const correct = question.choices.find((choice) => choice.is_correct);
      return {
        accepted: true,
        answered_count: Object.keys(attempt.answers).length,
        is_correct: choiceId === correct.id,
        correct_choice_id: correct.id,
        choice_label: correct.choice_label,
        correct_choice_text: correct.choice_text,
        explanation: question.explanation,
      };
    });
    res.json(result);
  });
  router.post("/attempts/complete", async (req, res) => {
    const result = await transaction(pool, async (client) => {
      const attempt = await getAttempt(
        client,
        req.body.attempt_token,
        req.user.id,
        true,
      );
      if (attempt.completed_result) return attempt.completed_result;
      const total = attempt.question_snapshot.length;
      if (Object.keys(attempt.answers).length !== total)
        fail(409, "Answer every question before finishing.");
      const score = attempt.question_snapshot.filter(
        (q) =>
          q.choices.find((c) => c.id === attempt.answers[q.id])?.is_correct,
      ).length;
      const result = {
        score,
        total,
        percentage: Math.round((score / total) * 100),
        completed_at: new Date().toISOString(),
      };
      await client.query(
        "INSERT INTO attempts(attempt_token,user_id,quiz_id,score,total_questions,completed_at) VALUES($1,$2,$3,$4,$5,$6)",
        [
          attempt.token,
          req.user.id,
          attempt.quiz_id,
          score,
          total,
          result.completed_at,
        ],
      );
      await client.query(
        "UPDATE quiz_sessions SET completed_result=$1 WHERE token=$2",
        [JSON.stringify(result), attempt.token],
      );
      return result;
    });
    res.json(result);
  });
  router.get("/flashcards/:id/questions", async (req, res) => {
    const quizId = id(req.params.id);
    if (
      !(await pool.query("SELECT 1 FROM quizzes WHERE id=$1", [quizId]))
        .rowCount
    )
      fail(404, "Quiz not found.");
    res.json(await questionBank(pool, quizId));
  });
  return router;
}
