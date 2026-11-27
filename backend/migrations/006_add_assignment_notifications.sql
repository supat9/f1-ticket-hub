BEGIN;

CREATE TABLE IF NOT EXISTS assignment_notifications (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    ticket_id bigint NOT NULL UNIQUE REFERENCES tickets (id) ON DELETE CASCADE,
    recipient_id bigint NOT NULL REFERENCES app_users (id) ON DELETE CASCADE,
    created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    read_at timestamptz
);

CREATE INDEX IF NOT EXISTS assignment_notifications_inbox
    ON assignment_notifications (recipient_id, id DESC);
CREATE INDEX IF NOT EXISTS assignment_notifications_unread
    ON assignment_notifications (recipient_id) WHERE read_at IS NULL;

CREATE OR REPLACE FUNCTION notify_ticket_assignment() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP = 'UPDATE' THEN
        IF NEW.assignee_id IS NOT DISTINCT FROM OLD.assignee_id THEN
            RETURN NULL;
        END IF;
        DELETE FROM assignment_notifications WHERE ticket_id = NEW.id;
    END IF;

    IF NEW.assignee_id IS NOT NULL THEN
        INSERT INTO assignment_notifications (ticket_id, recipient_id)
        VALUES (NEW.id, NEW.assignee_id);
    END IF;
    RETURN NULL;
END;
$$;

CREATE OR REPLACE TRIGGER ticket_assignment_notification
AFTER INSERT OR UPDATE OF assignee_id ON tickets
FOR EACH ROW EXECUTE FUNCTION notify_ticket_assignment();

COMMIT;
