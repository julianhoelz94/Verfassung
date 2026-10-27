ALTER TABLE import_setup_proposals
    ADD COLUMN confirmation_attempt UUID,
    ADD COLUMN confirmation_started_at TIMESTAMPTZ,
    ADD COLUMN confirmation_requested_at TIMESTAMPTZ,
    ADD COLUMN confirmation_operation UUID,
    ADD COLUMN confirmation_legacy BOOLEAN NOT NULL DEFAULT false;

-- Older interrupted calls may have created a resource before recording its ID.
-- A no-write result for a new receipt cannot prove that such legacy work is absent.
UPDATE import_setup_proposals SET confirmation_legacy = true
    WHERE status = 'confirming' OR constitution_id IS NOT NULL;

CREATE INDEX import_setup_confirmation_pending_idx
    ON import_setup_proposals(updated_at) WHERE status = 'confirming';
