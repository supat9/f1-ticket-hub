BEGIN;

ALTER TABLE tickets ADD COLUMN IF NOT EXISTS completed_at timestamptz;

CREATE OR REPLACE FUNCTION record_ticket_completion() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.status IN ('resolved', 'closed') THEN
        NEW.completed_at := COALESCE(OLD.completed_at, clock_timestamp());
    ELSE
        NEW.completed_at := NULL;
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER ticket_completion_date
BEFORE UPDATE OF status ON tickets
FOR EACH ROW WHEN (OLD.status IS DISTINCT FROM NEW.status)
EXECUTE FUNCTION record_ticket_completion();

COMMIT;
