CREATE TABLE csv_previews (
  token UUID PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  validated_rows JSONB NOT NULL,
  row_errors JSONB NOT NULL,
  imported_result JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '1 hour'
);
