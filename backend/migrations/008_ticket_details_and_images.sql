BEGIN;

ALTER TABLE tickets
    ADD COLUMN IF NOT EXISTS customer_name text NOT NULL DEFAULT '' CHECK (char_length(customer_name) <= 160),
    ADD COLUMN IF NOT EXISTS product text NOT NULL DEFAULT '' CHECK (product IN ('', 'dr_ease', 'ease_pos')),
    ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT '' CHECK (category IN ('', 'sd', 'bug', 'adjustment', 'question', 'data', 'customize')),
    ADD COLUMN IF NOT EXISTS notes text NOT NULL DEFAULT '' CHECK (char_length(notes) <= 5000),
    ADD COLUMN IF NOT EXISTS details_version integer NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS ticket_images (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    ticket_id bigint NOT NULL REFERENCES tickets (id) ON DELETE CASCADE,
    content_type text NOT NULL CHECK (content_type IN ('image/jpeg', 'image/png')),
    digest bytea NOT NULL,
    content bytea NOT NULL CHECK (octet_length(content) BETWEEN 1 AND 5242880),
    UNIQUE (ticket_id, digest)
);

COMMIT;
