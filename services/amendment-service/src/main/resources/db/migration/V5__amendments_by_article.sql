-- article_number already exists (V2). This migration stores constitution_id so
-- GET /amendments?constitutionId=&articleNumber= can stay inside amendment-db.
ALTER TABLE version_transitions
  ADD COLUMN constitution_id UUID;

UPDATE version_transitions
SET constitution_id = '01900000-0000-4000-8000-000000000002';

CREATE INDEX version_transitions_constitution_idx ON version_transitions (constitution_id);

-- Second hop (2022 → draft-internal) so AMD-4 can assert two versions of Article 1.
INSERT INTO version_transitions (id, source_version_id, target_version_id, constitution_id) VALUES
  (
    '01900000-0000-4000-8000-000000000321',
    '01900000-0000-4000-8000-000000000004',
    '01900000-0000-4000-8000-000000000005',
    '01900000-0000-4000-8000-000000000002'
  );

INSERT INTO amendments (id, version_transition_id, title, summary, enacted_on, source_reference) VALUES
  (
    '01900000-0000-4000-8000-000000000322',
    '01900000-0000-4000-8000-000000000321',
    'Later Article 1 revision (seed)',
    'Demo second hop touching Article 1 after the 2022 snapshot.',
    DATE '2023-06-01',
    'BGBl. I 2023'
  );

INSERT INTO amendment_changes (
  id, amendment_id, article_id, article_number, change_type, note,
  node_id, changed_on, effective_on, amending_law_citation_id
) VALUES (
  '01900000-0000-4000-8000-000000000323',
  '01900000-0000-4000-8000-000000000322',
  '01900000-0000-4000-8000-000000000201',
  '1',
  'changed',
  'Further wording tweak on Article 1.',
  NULL,
  DATE '2023-06-01',
  DATE '2023-06-01',
  NULL
);
