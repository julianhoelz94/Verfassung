-- Fixed ids so content-service seed can reference the same version ids (opaque, no cross-DB FK).
INSERT INTO countries (id, iso_code, name) VALUES
  ('01900000-0000-4000-8000-000000000001', 'DE', 'Germany');

INSERT INTO constitutions (id, country_id, slug, title) VALUES
  (
    '01900000-0000-4000-8000-000000000002',
    '01900000-0000-4000-8000-000000000001',
    'basic-law',
    'Basic Law for the Federal Republic of Germany'
  );

INSERT INTO constitution_versions (
  id, constitution_id, version_label, effective_date, publication_status, language_code, source_url, gazette_reference
) VALUES
  (
    '01900000-0000-4000-8000-000000000003',
    '01900000-0000-4000-8000-000000000002',
    '1949',
    DATE '1949-05-23',
    'published',
    'en',
    'https://www.gesetze-im-internet.de/gg/',
    'BGBl. 1949'
  ),
  (
    '01900000-0000-4000-8000-000000000004',
    '01900000-0000-4000-8000-000000000002',
    '2022',
    DATE '2022-12-19',
    'published',
    'en',
    'https://www.gesetze-im-internet.de/gg/',
    'BGBl. I 2022'
  ),
  (
    '01900000-0000-4000-8000-000000000005',
    '01900000-0000-4000-8000-000000000002',
    'draft-internal',
    NULL,
    'draft',
    'en',
    NULL,
    NULL
  );

INSERT INTO constitution_sources (id, constitution_version_id, source_url, gazette_reference, note) VALUES
  (
    '01900000-0000-4000-8000-000000000006',
    '01900000-0000-4000-8000-000000000004',
    'https://www.gesetze-im-internet.de/gg/',
    'BGBl. I 2022',
    'Seed provenance for local-stack demo'
  );
