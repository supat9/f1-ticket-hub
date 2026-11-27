BEGIN;

CREATE TABLE IF NOT EXISTS tickets (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    request_id uuid NOT NULL UNIQUE,
    title text NOT NULL CHECK (char_length(title) <= 160 AND title ~ '[^[:space:]]'),
    description text NOT NULL CHECK (char_length(description) <= 5000 AND description ~ '[^[:space:]]'),
    source text NOT NULL CHECK (source IN ('customer', 'internal')),
    priority text NOT NULL DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
    status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'resolved', 'closed')),
    created_at timestamptz NOT NULL DEFAULT now()
);

COMMIT;
