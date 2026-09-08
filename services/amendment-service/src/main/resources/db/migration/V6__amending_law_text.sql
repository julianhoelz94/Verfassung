-- AMD-6: cite the amending law as text. Keep amending_law_citation_id for a
-- future citation-service (SRV-5); it is not required.
ALTER TABLE amendment_changes
  ADD COLUMN amending_law_title TEXT,
  ADD COLUMN amending_law_citation TEXT;

UPDATE amendment_changes
SET
  amending_law_title = 'Gesetz zur Änderung des Grundgesetzes (seed)',
  amending_law_citation = 'BGBl. I 2022'
WHERE amendment_id = '01900000-0000-4000-8000-000000000302';
