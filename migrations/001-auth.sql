CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  username VARCHAR(50) NOT NULL,
  email VARCHAR(100) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role VARCHAR(20) NOT NULL DEFAULT 'player' CHECK (role IN ('player','admin')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX users_username_unique ON users (lower(username));
CREATE UNIQUE INDEX users_email_unique ON users (lower(email));
CREATE TABLE sessions (sid VARCHAR PRIMARY KEY, sess JSON NOT NULL, expire TIMESTAMP NOT NULL);
CREATE INDEX sessions_expire_idx ON sessions (expire);
