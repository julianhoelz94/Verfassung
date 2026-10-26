ALTER TABLE document_link_events DROP CONSTRAINT document_link_events_target_type_check;
ALTER TABLE document_link_events ADD CONSTRAINT document_link_events_target_type_check
  CHECK (target_type IN ('constitution', 'version', 'amendment', 'country_wiki', 'constitution_wiki'));

ALTER TABLE document_link_events DROP CONSTRAINT non_amendment_links_have_no_scope;
ALTER TABLE document_link_events ADD CONSTRAINT non_amendment_links_have_no_scope
  CHECK (
    target_type = 'amendment'
    OR (target_type IN ('country_wiki', 'constitution_wiki') AND scope_revision_id IS NOT NULL)
    OR (target_type IN ('constitution', 'version') AND scope_revision_id IS NULL)
  );
