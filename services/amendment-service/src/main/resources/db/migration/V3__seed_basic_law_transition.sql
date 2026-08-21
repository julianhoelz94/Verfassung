INSERT INTO version_transitions (id, source_version_id, target_version_id) VALUES
  (
    '01900000-0000-4000-8000-000000000301',
    '01900000-0000-4000-8000-000000000003',
    '01900000-0000-4000-8000-000000000004'
  );

INSERT INTO amendments (id, version_transition_id, title, summary, enacted_on, source_reference) VALUES
  (
    '01900000-0000-4000-8000-000000000302',
    '01900000-0000-4000-8000-000000000301',
    'Post-1949 Basic Law revisions (seed)',
    'Demo change set between the 1949 snapshot and the 2022 snapshot: expanded Article 1, added asylum and EU provisions, and tightened the eternity clause.',
    DATE '2022-12-19',
    'BGBl. I 2022'
  );

INSERT INTO amendment_changes (id, amendment_id, article_id, article_number, change_type, note) VALUES
  ('01900000-0000-4000-8000-000000000311', '01900000-0000-4000-8000-000000000302', '01900000-0000-4000-8000-000000000201', '1', 'modified', 'Human-rights sentence added to Article 1.'),
  ('01900000-0000-4000-8000-000000000312', '01900000-0000-4000-8000-000000000302', '01900000-0000-4000-8000-000000000206', '16a', 'added', 'Right of asylum.'),
  ('01900000-0000-4000-8000-000000000313', '01900000-0000-4000-8000-000000000302', '01900000-0000-4000-8000-000000000208', '23', 'added', 'European Union participation.'),
  ('01900000-0000-4000-8000-000000000314', '01900000-0000-4000-8000-000000000302', '01900000-0000-4000-8000-000000000209', '79', 'modified', 'Eternity clause spelled out.');
