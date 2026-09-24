INSERT INTO countries (id, iso_code, name) VALUES ('01900000-0000-4000-8000-000000000001', 'DE', 'Germany');
INSERT INTO constitutions (id, country_id, slug, title) VALUES ('01900000-0000-4000-8000-000000000002', '01900000-0000-4000-8000-000000000001', 'basic-law', 'Basic Law for the Federal Republic of Germany');
INSERT INTO constitution_versions (id, constitution_id, version_label, effective_date, publication_status, language_code, source_url, gazette_reference, provenance, verification_state, hop_kind, listing, predecessor_version_id, legal_version_id, legal_predecessor_version_id) VALUES
('01900000-0000-4000-8000-000000000003', '01900000-0000-4000-8000-000000000002', '1949', DATE '1949-05-23', 'published', 'en', 'https://www.gesetze-im-internet.de/gg/', 'BGBl. 1949', 'demo', 'unverified', 'initial', 'public', NULL, '01900000-0000-4000-8000-000000000003', NULL),
('01900000-0000-4000-8000-000000000004', '01900000-0000-4000-8000-000000000002', '2022', DATE '2022-12-19', 'published', 'en', 'https://www.gesetze-im-internet.de/gg/', 'BGBl. I 2022', 'demo', 'unverified', 'legal', 'public', '01900000-0000-4000-8000-000000000003', '01900000-0000-4000-8000-000000000004', '01900000-0000-4000-8000-000000000003'),
('01900000-0000-4000-8000-000000000005', '01900000-0000-4000-8000-000000000002', 'draft-internal', NULL, 'draft', 'en', NULL, NULL, 'demo', 'unverified', 'initial', 'public', NULL, '01900000-0000-4000-8000-000000000005', NULL);
INSERT INTO constitution_sources (id, constitution_version_id, source_url, gazette_reference, note, provenance, verification_state) VALUES ('01900000-0000-4000-8000-000000000006', '01900000-0000-4000-8000-000000000004', 'https://www.gesetze-im-internet.de/gg/', 'BGBl. I 2022', 'Test fixture provenance', 'demo', 'unverified');
INSERT INTO constitution_node_kinds (id, constitution_id, kind_code, display_label, sort_order, may_hold_text, may_hold_children) VALUES
('01900000-0000-4000-8000-000000000011', '01900000-0000-4000-8000-000000000002', 'article', 'Article', 1, TRUE, TRUE),
('01900000-0000-4000-8000-000000000012', '01900000-0000-4000-8000-000000000002', 'paragraph', 'Paragraph', 2, TRUE, TRUE),
('01900000-0000-4000-8000-000000000013', '01900000-0000-4000-8000-000000000002', 'sentence', 'Sentence', 3, TRUE, FALSE);
INSERT INTO constitution_node_kind_edges (constitution_id, parent_kind_code, child_kind_code) VALUES
('01900000-0000-4000-8000-000000000002', 'article', 'paragraph'),
('01900000-0000-4000-8000-000000000002', 'paragraph', 'sentence');
UPDATE constitution_node_kinds SET show_title = TRUE, show_kind = TRUE WHERE constitution_id = '01900000-0000-4000-8000-000000000002' AND kind_code = 'article';
UPDATE constitution_node_kinds SET presentation = 'concatenated', show_label = FALSE WHERE constitution_id = '01900000-0000-4000-8000-000000000002' AND kind_code = 'sentence';
