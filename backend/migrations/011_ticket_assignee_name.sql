BEGIN;

ALTER TABLE tickets ADD COLUMN IF NOT EXISTS assignee_name text NOT NULL DEFAULT ''
    CHECK (char_length(assignee_name) <= 120 AND (assignee_id IS NULL OR assignee_name = ''));

COMMIT;
