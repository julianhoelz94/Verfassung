-- Structured tree for Article 1 only (demo). Other articles stay flat roots with body.
-- 1949 Article 1: one paragraph, two sentences.
INSERT INTO content_nodes (id, version_id, kind, parent_id, label, number, title, body, sort_order) VALUES
  (
    '01900000-0000-4000-8000-000000000121',
    '01900000-0000-4000-8000-000000000003',
    'paragraph',
    '01900000-0000-4000-8000-000000000101',
    '(1)', NULL, NULL, NULL, 1
  ),
  (
    '01900000-0000-4000-8000-000000000122',
    '01900000-0000-4000-8000-000000000003',
    'sentence',
    '01900000-0000-4000-8000-000000000121',
    '1', NULL, NULL,
    'Human dignity shall be inviolable.',
    1
  ),
  (
    '01900000-0000-4000-8000-000000000123',
    '01900000-0000-4000-8000-000000000003',
    'sentence',
    '01900000-0000-4000-8000-000000000121',
    '2', NULL, NULL,
    'To respect and protect it shall be the duty of all state authority.',
    2
  );

-- 2022 Article 1: two paragraphs (second sentence group is the post-1949 addition).
INSERT INTO content_nodes (id, version_id, kind, parent_id, label, number, title, body, sort_order) VALUES
  (
    '01900000-0000-4000-8000-000000000221',
    '01900000-0000-4000-8000-000000000004',
    'paragraph',
    '01900000-0000-4000-8000-000000000201',
    '(1)', NULL, NULL, NULL, 1
  ),
  (
    '01900000-0000-4000-8000-000000000222',
    '01900000-0000-4000-8000-000000000004',
    'sentence',
    '01900000-0000-4000-8000-000000000221',
    '1', NULL, NULL,
    'Human dignity shall be inviolable.',
    1
  ),
  (
    '01900000-0000-4000-8000-000000000223',
    '01900000-0000-4000-8000-000000000004',
    'sentence',
    '01900000-0000-4000-8000-000000000221',
    '2', NULL, NULL,
    'To respect and protect it shall be the duty of all state authority.',
    2
  ),
  (
    '01900000-0000-4000-8000-000000000224',
    '01900000-0000-4000-8000-000000000004',
    'paragraph',
    '01900000-0000-4000-8000-000000000201',
    '(2)', NULL, NULL, NULL, 2
  ),
  (
    '01900000-0000-4000-8000-000000000225',
    '01900000-0000-4000-8000-000000000004',
    'sentence',
    '01900000-0000-4000-8000-000000000224',
    '1', NULL, NULL,
    'The German people therefore acknowledge inviolable and inalienable human rights as the basis of every community, of peace and of justice in the world.',
    1
  );
