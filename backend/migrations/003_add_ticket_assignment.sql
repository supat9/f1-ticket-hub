BEGIN;

ALTER TABLE tickets
    ADD COLUMN IF NOT EXISTS code text GENERATED ALWAYS AS (
        'F1-' || lpad(id::text, greatest(6, length(id::text)), '0')
    ) VIRTUAL,
    ADD COLUMN IF NOT EXISTS owner_id bigint REFERENCES app_users (id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS assignee_id bigint REFERENCES app_users (id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS assignment_version integer NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS request_fingerprint bytea;

COMMIT;
