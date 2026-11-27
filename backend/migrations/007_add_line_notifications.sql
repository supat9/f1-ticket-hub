BEGIN;

CREATE TABLE IF NOT EXISTS staff_line (
    user_id bigint PRIMARY KEY REFERENCES app_users (id) ON DELETE CASCADE,
    line_user_id text UNIQUE,
    linked_at timestamptz,
    pairing_hash bytea UNIQUE,
    pairing_expires_at timestamptz
);

CREATE TABLE IF NOT EXISTS line_assignment_outbox (
    notification_id bigint PRIMARY KEY REFERENCES assignment_notifications (id) ON DELETE CASCADE,
    line_user_id text NOT NULL REFERENCES staff_line (line_user_id) ON DELETE CASCADE,
    retry_key uuid NOT NULL DEFAULT gen_random_uuid(),
    attempts integer NOT NULL DEFAULT 0,
    next_attempt_at timestamptz NOT NULL DEFAULT now(),
    finished_at timestamptz,
    accepted boolean
);

CREATE INDEX IF NOT EXISTS line_assignment_due
    ON line_assignment_outbox (next_attempt_at) WHERE finished_at IS NULL;
CREATE INDEX IF NOT EXISTS line_assignment_recipient
    ON line_assignment_outbox (line_user_id);

CREATE OR REPLACE FUNCTION queue_line_assignment() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    INSERT INTO line_assignment_outbox (notification_id, line_user_id)
    SELECT NEW.id, line_user_id FROM staff_line
    WHERE user_id = NEW.recipient_id AND line_user_id IS NOT NULL
    FOR KEY SHARE;
    RETURN NULL;
END;
$$;

CREATE OR REPLACE TRIGGER line_assignment_notification
AFTER INSERT ON assignment_notifications
FOR EACH ROW EXECUTE FUNCTION queue_line_assignment();

COMMIT;
