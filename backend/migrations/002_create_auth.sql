BEGIN;

CREATE TABLE IF NOT EXISTS app_users (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    email text NOT NULL UNIQUE CHECK (email = lower(email) AND char_length(email) <= 254),
    password_hash text NOT NULL
);

CREATE TABLE IF NOT EXISTS app_sessions (
    token_hash bytea PRIMARY KEY,
    user_id bigint NOT NULL REFERENCES app_users (id) ON DELETE CASCADE,
    expires_at timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS app_sessions_expires_at_idx ON app_sessions (expires_at);

COMMIT;
