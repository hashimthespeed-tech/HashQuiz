import { Router } from 'express';
import { requireAuth } from './auth.js';

export function historyRouter(pool) {
  const router = Router(); router.use(requireAuth);
  router.get('/users/history', async (req, res) => {
    const { rows } = await pool.query(`SELECT a.id,a.quiz_id,q.title AS quiz_title,a.score,a.total_questions,
      ROUND(100.0*a.score/a.total_questions)::int AS percentage,a.completed_at
      FROM attempts a JOIN quizzes q ON q.id=a.quiz_id WHERE a.user_id=$1 ORDER BY a.completed_at DESC,a.id DESC`, [req.user.id]);
    res.json(rows);
  });
  return router;
}
