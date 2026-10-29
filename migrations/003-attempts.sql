CREATE TABLE attempts (
  id SERIAL PRIMARY KEY,
  attempt_token UUID UNIQUE NOT NULL,
  user_id INTEGER NOT NULL REFERENCES users(id),
  quiz_id INTEGER NOT NULL REFERENCES quizzes(id),
  score INTEGER NOT NULL CHECK(score BETWEEN 0 AND 10),
  total_questions INTEGER NOT NULL CHECK(total_questions = 10),
  completed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX attempts_user_idx ON attempts(user_id, completed_at DESC);
CREATE INDEX attempts_quiz_idx ON attempts(quiz_id,score DESC,completed_at);
-- Preserve completed phase-2 results when applying this additive migration.
INSERT INTO attempts(attempt_token,user_id,quiz_id,score,total_questions,completed_at)
SELECT token,user_id,quiz_id,(completed_result->>'score')::integer,
  (completed_result->>'total')::integer,(completed_result->>'completed_at')::timestamptz
FROM quiz_sessions WHERE completed_result IS NOT NULL;
