"""OPS-1: document-service-migration.md, not the migration's current output.

The fake transport stores only documented API resources. The actual candidate
selection and migration execute, including a second run and a partial failure.
"""
import contextlib
import copy
import importlib.util
import io
import json
import os
from pathlib import Path
import sys
import unittest
from unittest.mock import patch

SPEC = importlib.util.spec_from_file_location('document_migration', Path(__file__).resolve().parents[1] / 'migrate_document_references.py')
migration = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(migration)


class MigrationContractTests(unittest.TestCase):
    def setUp(self):
        self.documents = []
        self.links = []
        self.writes = []
        self.fail_attachment = False
        self.version = {'id': 'snapshot-1949', 'versionLabel': '1949', 'sourceUrl': 'https://archive.example/1949'}
        self.amendment = {'id': 'instrument', 'title': 'Reform', 'publishedRevisionId': 'published-r1', 'documents': [
            {'url': 'https://archive.example/reform', 'label': 'Gazette'},
            {'fileId': 'legacy-file', 'label': 'Scanned source'},
            {'url': 'javascript:alert(1)', 'label': 'Legacy invalid URL'},
            {},
        ]}
        self.revisions = [{'id': 'published-r1'}, {'id': 'draft-r2'}]

    def transport(self, base, path, token, method='GET', body=None):
        self.assertEqual(base, 'https://atlas.example')
        self.assertEqual(token, 'staff-token')
        if method == 'POST':
            self.writes.append((path, copy.deepcopy(body)))
            if path == '/api/document/documents':
                record = {'id': f'doc-{len(self.documents) + 1}', 'revision': {'id': f'rev-{len(self.documents) + 1}', **body}}
                self.documents.append(record)
                return copy.deepcopy(record)
            if path.startswith('/api/document/links/'):
                if self.fail_attachment:
                    self.fail_attachment = False
                    raise OSError('Attachment unavailable')
                self.links.append((path, copy.deepcopy(body)))
                return []
            self.fail('Migration attempted an undocumented mutation: ' + path)
        if path == '/api/catalog/countries':
            return [{'isoCode': 'XA'}]
        if path == '/api/catalog/countries/XA':
            return {'constitutions': [{'id': 'charter', 'title': 'Charter'}]}
        if path == '/api/catalog/constitutions/charter/versions?listing=all':
            return [self.version, copy.deepcopy(self.version)]
        if path == '/api/amendment/constitutions/charter/amendments?status=all':
            return [self.amendment]
        if path == '/api/amendment/amendments/instrument/revisions':
            return self.revisions
        if path == '/api/document/documents':
            return copy.deepcopy(self.documents)
        if path.startswith('/api/document/links/'):
            target, _, query = path.partition('?')
            scope = query.removeprefix('scopeRevisionId=') or None
            return [copy.deepcopy(body) for linked_target, body in self.links
                    if linked_target == target and body.get('scopeRevisionId') == scope]
        self.fail('Unexpected API read: ' + path)

    def run_migration(self, apply=False):
        out, err = io.StringIO(), io.StringIO()
        arguments = ['migration', '--base-url', 'https://atlas.example/'] + (['--apply'] if apply else [])
        with patch.object(sys, 'argv', arguments), patch.dict(os.environ, {'DOCUMENT_MIGRATION_TOKEN': 'staff-token'}), patch.object(migration, 'request', side_effect=self.transport), contextlib.redirect_stdout(out), contextlib.redirect_stderr(err):
            migration.main()
        return [json.loads(line) for line in out.getvalue().splitlines()], err.getvalue()

    def test_dry_run_lists_unique_proposals_without_any_write(self):
        proposals, summary = self.run_migration()
        self.assertEqual(len(proposals), 4)
        self.assertEqual(self.writes, [])
        self.assertEqual(self.documents, [])
        self.assertIn('would be migrated', summary)
        self.assertEqual(proposals[0]['targetId'], 'snapshot-1949')
        self.assertEqual(proposals[0]['sourceUrl'], 'https://archive.example/1949')

    def test_apply_pins_document_revisions_and_amendment_draft_scope(self):
        self.run_migration(apply=True)
        self.assertEqual(len(self.documents), 4)
        self.assertEqual(self.links[0], ('/api/document/links/version/snapshot-1949', {'documentId': 'doc-1', 'revisionId': 'rev-1', 'scopeRevisionId': None}))
        for target, body in self.links[1:]:
            self.assertEqual(target, '/api/document/links/amendment/instrument')
            self.assertEqual(body['scopeRevisionId'], 'draft-r2')
            self.assertIsNotNone(body['revisionId'])
        self.assertEqual({path.split('/')[2] for path, _ in self.writes}, {'document'})

    def test_repeat_apply_does_not_duplicate_documents_or_links(self):
        self.run_migration(apply=True)
        self.writes.clear()
        proposals, summary = self.run_migration(apply=True)
        self.assertEqual(proposals, [])
        self.assertEqual(self.writes, [])
        self.assertIn('0 reference(s) migrated', summary)

    def test_published_amendment_revision_is_retained_as_legacy(self):
        self.revisions = [{'id': 'published-r1'}]
        proposals, summary = self.run_migration(apply=True)
        skipped = [row for row in proposals if row['action'] == 'skip']
        self.assertEqual(len(skipped), 3)
        self.assertTrue(all(row['skipReason'] == 'published_revision_is_immutable' for row in skipped))
        self.assertEqual(len(self.documents), 1)
        self.assertIn('3 published or unscoped amendment reference(s) retained as legacy', summary)

    def test_unscoped_amendments_are_not_attached_to_an_arbitrary_revision(self):
        self.revisions = []
        self.run_migration(apply=True)
        self.assertEqual([path for path, _ in self.links], ['/api/document/links/version/snapshot-1949'])

    def test_legacy_file_and_invalid_url_survive_as_attributed_descriptions(self):
        proposals, _ = self.run_migration()
        scanned = next(row for row in proposals if row['title'] == 'Scanned source')
        invalid = next(row for row in proposals if row['title'] == 'Legacy invalid URL')
        self.assertIsNone(scanned['sourceUrl'])
        self.assertEqual(scanned['description'], 'Legacy archived file ID: legacy-file')
        self.assertIsNone(invalid['sourceUrl'])
        self.assertEqual(invalid['description'], 'Legacy URL: javascript:alert(1)')

    def test_existing_matching_document_is_reused_without_overwriting_metadata(self):
        self.documents = [{'id': 'existing', 'revision': {'id': 'existing-r4', 'title': 'Charter — 1949', 'sourceUrl': 'https://archive.example/1949', 'description': 'Legacy constitution source for version snapshot-1949'}}]
        self.run_migration(apply=True)
        self.assertEqual(self.links[0][1]['documentId'], 'existing')
        self.assertEqual(self.links[0][1]['revisionId'], 'existing-r4')
        self.assertEqual(self.documents[0]['revision']['id'], 'existing-r4')

    def test_partial_failure_is_visible_and_retry_reuses_the_created_document(self):
        self.fail_attachment = True
        with self.assertRaisesRegex(OSError, 'Attachment unavailable'):
            self.run_migration(apply=True)
        self.assertEqual(len(self.documents), 1)
        self.assertEqual(self.links, [])
        self.writes.clear()
        self.run_migration(apply=True)
        self.assertEqual(len(self.documents), 4)
        self.assertEqual(self.links[0][1]['documentId'], 'doc-1')
        self.assertEqual(len([path for path, _ in self.writes if path == '/api/document/documents']), 3)

    def test_missing_credentials_rejects_before_any_network_request(self):
        with patch.object(sys, 'argv', ['migration', '--base-url', 'https://atlas.example']), patch.dict(os.environ, {}, clear=True), patch.object(migration, 'request') as request, contextlib.redirect_stderr(io.StringIO()), self.assertRaises(SystemExit) as stopped:
            migration.main()
        self.assertEqual(stopped.exception.code, 2)
        request.assert_not_called()


if __name__ == '__main__':
    unittest.main()
