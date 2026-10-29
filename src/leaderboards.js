import { Router } from "express";
import { requireAuth } from "./auth.js";
import { fail, id } from "./errors.js";

export function leaderboardRouter(pool) {
  const router = Router();
  router.use(requireAuth);
  router.get("/leaderboard/overall", async (req, res) => {
    const { rows } =
      await pool.query(`SELECT u.id AS user_id,u.username,COUNT(a.id)::int AS total_completed_attempts,
      MAX(a.completed_at) AS latest_attempt_time FROM attempts a JOIN users u ON u.id=a.user_id
      GROUP BY u.id ORDER BY total_completed_attempts DESC,latest_attempt_time ASC,u.id ASC`);
    res.json(rows);
  });
  router.get("/leaderboard/quiz/:id", async (req, res) => {
    const quizId = id(req.params.id);
    if (
      !(await pool.query("SELECT 1 FROM quizzes WHERE id=$1", [quizId]))
        .rowCount
    )
      fail(404, "Quiz not found.");
    const { rows } = await pool.query(
      `SELECT u.id AS user_id,u.username,MAX(a.score) AS highest_score,
      COUNT(a.id)::int AS total_completed_attempts,MIN(a.completed_at) AS earliest_attempt_time
      FROM attempts a JOIN users u ON u.id=a.user_id WHERE a.quiz_id=$1
      GROUP BY u.id ORDER BY highest_score DESC,earliest_attempt_time ASC,u.id ASC`,
      [quizId],
    );
    res.json(rows);
  });
  return router;
}
