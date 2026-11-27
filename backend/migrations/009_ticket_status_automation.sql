BEGIN;

CREATE TABLE IF NOT EXISTS dev_automation_tokens (
    user_id bigint PRIMARY KEY REFERENCES app_users (id) ON DELETE CASCADE,
    token_hash bytea NOT NULL UNIQUE,
    expires_at timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS ticket_status_automation (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    ticket_id bigint NOT NULL REFERENCES tickets (id) ON DELETE CASCADE,
    actor_id bigint REFERENCES app_users (id) ON DELETE SET NULL,
    request_id text NOT NULL CHECK (char_length(request_id) BETWEEN 1 AND 128),
    previous_status text NOT NULL CHECK (previous_status IN ('open', 'in_progress', 'resolved', 'closed')),
    status text NOT NULL CHECK (status IN ('open', 'in_progress', 'resolved', 'closed') AND status <> previous_status),
    evidence text NOT NULL CHECK (char_length(evidence) BETWEEN 1 AND 1000),
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (ticket_id, actor_id, request_id)
);

COMMIT;
