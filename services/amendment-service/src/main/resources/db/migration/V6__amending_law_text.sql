-- AMD-6: cite the amending law as text. Keep amending_law_citation_id for a
-- future citation-service (SRV-5); it is not required.
ALTER TABLE amendment_changes
  ADD COLUMN amending_law_title TEXT,
  ADD COLUMN amending_law_citation TEXT;
