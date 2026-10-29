CREATE TABLE quizzes (
  id SERIAL PRIMARY KEY,
  slug VARCHAR(40) UNIQUE NOT NULL,
  title VARCHAR(100) UNIQUE NOT NULL,
  description TEXT NOT NULL,
  category VARCHAR(40) NOT NULL
);
CREATE TABLE questions (
  id SERIAL PRIMARY KEY,
  quiz_id INTEGER NOT NULL REFERENCES quizzes(id),
  question_text TEXT NOT NULL,
  explanation TEXT NOT NULL
);
CREATE INDEX questions_quiz_idx ON questions(quiz_id);
CREATE TABLE choices (
  id SERIAL PRIMARY KEY,
  question_id INTEGER NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  choice_label CHAR(1) NOT NULL CHECK (choice_label IN ('A','B','C','D')),
  choice_order INTEGER NOT NULL CHECK (choice_order BETWEEN 1 AND 4),
  choice_text TEXT NOT NULL,
  is_correct BOOLEAN NOT NULL DEFAULT FALSE,
  UNIQUE(question_id, choice_label), UNIQUE(question_id, choice_order)
);
CREATE UNIQUE INDEX choices_one_correct ON choices(question_id) WHERE is_correct;
CREATE TABLE quiz_sessions (
  token UUID PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  quiz_id INTEGER NOT NULL REFERENCES quizzes(id),
  question_snapshot JSONB NOT NULL,
  answers JSONB NOT NULL DEFAULT '{}',
  completed_result JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '24 hours'
);
CREATE INDEX quiz_sessions_user_idx ON quiz_sessions(user_id);
