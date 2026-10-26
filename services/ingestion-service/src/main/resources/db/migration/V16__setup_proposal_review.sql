ALTER TABLE import_setup_proposals
    ADD COLUMN revision bigint NOT NULL DEFAULT 1,
    ADD COLUMN previous_payload jsonb,
    ADD COLUMN requested_changes text,
    ADD COLUMN changes_requested boolean NOT NULL DEFAULT false,
    ADD COLUMN display_overrides jsonb NOT NULL DEFAULT '{}'::jsonb;
