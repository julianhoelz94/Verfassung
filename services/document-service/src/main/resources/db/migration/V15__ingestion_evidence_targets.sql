ALTER TABLE document_link_events DROP CONSTRAINT document_link_events_target_type_check;
ALTER TABLE document_link_events ADD CONSTRAINT document_link_events_target_type_check
 CHECK (target_type IN ('constitution','version','amendment','country_wiki','constitution_wiki','jurisdiction_wiki','amendment_material','change_material','lifecycle_material','import_job','setup_proposal','migration_run','passage_citation'));
ALTER TABLE document_link_events DROP CONSTRAINT non_amendment_links_have_no_scope;
ALTER TABLE document_link_events ADD CONSTRAINT non_amendment_links_have_no_scope
 CHECK (target_type = 'amendment'
 OR (target_type IN ('country_wiki','constitution_wiki','jurisdiction_wiki','change_material','lifecycle_material','passage_citation') AND scope_revision_id IS NOT NULL)
 OR (target_type IN ('constitution','version','amendment_material','import_job','setup_proposal','migration_run') AND scope_revision_id IS NULL));
