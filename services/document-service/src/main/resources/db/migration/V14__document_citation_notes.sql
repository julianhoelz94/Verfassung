ALTER TABLE document_link_events ADD COLUMN citation_note text;
ALTER TABLE document_link_events ADD CONSTRAINT document_citation_note_length
  CHECK (citation_note IS NULL OR length(citation_note) <= 4000);
