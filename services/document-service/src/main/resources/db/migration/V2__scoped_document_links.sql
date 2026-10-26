ALTER TABLE document_link_events ADD COLUMN scope_revision_id UUID;
ALTER TABLE document_link_events DROP CONSTRAINT document_link_events_target_type_check;
ALTER TABLE document_link_events ADD CONSTRAINT document_link_events_target_type_check
    CHECK (target_type IN ('constitution', 'version', 'amendment'));
-- Existing amendment events predate revision scoping. Keep them for audit, while
-- the service requires a scope on every new amendment event.
ALTER TABLE document_link_events ADD CONSTRAINT non_amendment_links_have_no_scope
    CHECK (target_type = 'amendment' OR scope_revision_id IS NULL);
CREATE INDEX document_link_events_scope_idx
    ON document_link_events(target_type, target_id, scope_revision_id, occurred_at DESC, id DESC);
