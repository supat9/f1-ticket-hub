BEGIN;

ALTER TABLE tickets
    ADD COLUMN IF NOT EXISTS handoff_steps text NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS handoff_impact text NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS resolution_summary text NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS pull_request_url text NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS review_note text NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS workflow_version integer NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS first_started_at timestamptz;

CREATE TABLE IF NOT EXISTS ticket_activity (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    ticket_id bigint NOT NULL REFERENCES tickets (id) ON DELETE CASCADE,
    actor_id bigint REFERENCES app_users (id) ON DELETE SET NULL,
    kind text NOT NULL CHECK (kind IN ('created', 'status', 'assigned', 'details', 'note', 'handoff', 'submit', 'close', 'return', 'automation')),
    previous_status text NOT NULL DEFAULT '',
    status text NOT NULL DEFAULT '',
    detail text NOT NULL DEFAULT '',
    created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    automation_id bigint UNIQUE REFERENCES ticket_status_automation (id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS ticket_activity_ticket_id_idx ON ticket_activity (ticket_id, id DESC);
ALTER TABLE ticket_activity ADD COLUMN IF NOT EXISTS note_request_id uuid;
CREATE UNIQUE INDEX IF NOT EXISTS ticket_activity_note_request_idx ON ticket_activity (ticket_id, actor_id, note_request_id);

INSERT INTO ticket_activity (ticket_id, actor_id, kind, previous_status, status, detail, created_at, automation_id)
SELECT ticket_id, actor_id, 'automation', previous_status, status, evidence, created_at, id
FROM ticket_status_automation ORDER BY id ON CONFLICT (automation_id) DO NOTHING;

UPDATE tickets SET first_started_at = first_work.started_at
FROM (SELECT ticket_id, min(created_at) AS started_at FROM ticket_status_automation WHERE status = 'in_progress' GROUP BY ticket_id) first_work
WHERE tickets.id = first_work.ticket_id AND tickets.first_started_at IS NULL;

CREATE OR REPLACE FUNCTION enforce_ticket_workflow() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
    workflow_action text := coalesce(nullif(current_setting('f1.workflow_action', true), ''), '');
BEGIN
    IF OLD.handoff_steps <> '' AND workflow_action <> 'handoff' AND
        nullif(current_setting('f1.actor_id', true), '') IS NOT NULL AND
        (OLD.assignee_id, OLD.assignee_name) IS DISTINCT FROM (NEW.assignee_id, NEW.assignee_name) THEN
        RAISE EXCEPTION 'Reassign this case through the handoff' USING ERRCODE = '23514', CONSTRAINT = 'ticket_workflow_assignment';
    END IF;
    IF OLD.handoff_steps <> '' AND OLD.status IS DISTINCT FROM NEW.status AND NOT (
        (OLD.status = 'open' AND NEW.status = 'in_progress') OR
        (OLD.status = 'in_progress' AND NEW.status = 'resolved' AND workflow_action = 'submit') OR
        (OLD.status = 'resolved' AND NEW.status = 'closed' AND workflow_action = 'close') OR
        (OLD.status = 'resolved' AND NEW.status = 'in_progress' AND workflow_action = 'return')
    ) THEN
        RAISE EXCEPTION 'Use the ticket workflow to update this case' USING ERRCODE = '23514', CONSTRAINT = 'ticket_workflow_transition';
    END IF;
    IF OLD.status IS DISTINCT FROM NEW.status AND NEW.status = 'in_progress' THEN
        NEW.first_started_at := coalesce(OLD.first_started_at, clock_timestamp());
    END IF;
    IF OLD.handoff_steps <> '' AND NEW.workflow_version = OLD.workflow_version AND
        (OLD.status, OLD.owner_id, OLD.assignee_id, OLD.assignee_name) IS DISTINCT FROM
        (NEW.status, NEW.owner_id, NEW.assignee_id, NEW.assignee_name) THEN
        NEW.workflow_version := OLD.workflow_version + 1;
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER ticket_workflow_transition BEFORE UPDATE OF status, owner_id, assignee_id, assignee_name ON tickets
FOR EACH ROW EXECUTE FUNCTION enforce_ticket_workflow();

CREATE OR REPLACE FUNCTION record_ticket_activity() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
    actor bigint := nullif(current_setting('f1.actor_id', true), '')::bigint;
    workflow_action text := nullif(current_setting('f1.workflow_action', true), '');
    activity_detail text := coalesce(current_setting('f1.activity_detail', true), '');
BEGIN
    IF TG_OP = 'INSERT' THEN
        INSERT INTO ticket_activity (ticket_id, actor_id, kind, status, created_at)
        VALUES (NEW.id, actor, 'created', NEW.status, NEW.created_at);
        IF NEW.assignee_id IS NOT NULL OR NEW.assignee_name <> '' THEN
            INSERT INTO ticket_activity (ticket_id, actor_id, kind, detail) VALUES (NEW.id, actor, 'assigned', concat(
                'Assignee: — → ', coalesce(nullif(NEW.assignee_name, ''), (SELECT email FROM app_users WHERE id = NEW.assignee_id))));
        END IF;
        RETURN NEW;
    END IF;
    IF workflow_action IS NOT NULL AND workflow_action <> 'automation' THEN
        INSERT INTO ticket_activity (ticket_id, actor_id, kind, previous_status, status, detail)
        VALUES (NEW.id, actor, workflow_action, OLD.status, NEW.status, activity_detail);
    ELSIF workflow_action IS NULL AND OLD.status IS DISTINCT FROM NEW.status THEN
        INSERT INTO ticket_activity (ticket_id, actor_id, kind, previous_status, status)
        VALUES (NEW.id, actor, 'status', OLD.status, NEW.status);
    END IF;
    IF (OLD.owner_id, OLD.assignee_id, OLD.assignee_name) IS DISTINCT FROM (NEW.owner_id, NEW.assignee_id, NEW.assignee_name) THEN
        INSERT INTO ticket_activity (ticket_id, actor_id, kind, detail) VALUES (NEW.id, actor, 'assigned', concat(
            'Owner: ', coalesce((SELECT email FROM app_users WHERE id = OLD.owner_id), '—'), ' → ',
            coalesce((SELECT email FROM app_users WHERE id = NEW.owner_id), '—'), E'\nAssignee: ',
            coalesce(nullif(OLD.assignee_name, ''), (SELECT email FROM app_users WHERE id = OLD.assignee_id), '—'), ' → ',
            coalesce(nullif(NEW.assignee_name, ''), (SELECT email FROM app_users WHERE id = NEW.assignee_id), '—')));
    END IF;
    IF OLD.details_version <> NEW.details_version THEN
        INSERT INTO ticket_activity (ticket_id, actor_id, kind) VALUES (NEW.id, actor, 'details');
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER ticket_activity_log AFTER INSERT OR UPDATE ON tickets
FOR EACH ROW EXECUTE FUNCTION record_ticket_activity();

COMMIT;
