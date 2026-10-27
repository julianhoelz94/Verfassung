import datetime as dt
import hashlib
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
import urllib.error
from unittest.mock import patch


spec = importlib.util.spec_from_file_location("operations_check", Path(__file__).with_name("check.py"))
check = importlib.util.module_from_spec(spec)
spec.loader.exec_module(check)
VERSION = "01900000-0000-4000-8000-000000000001"
JURISDICTION = "01900000-0000-4000-8000-000000000002"


class FakeClient:
    def __init__(self, search_failure=False, backlog=0):
        self.search_failure = search_failure
        self.backlog = backlog

    def get(self, path, **kwargs):
        if path.endswith("/operations/status"):
            return {"service": path.split("/")[2], "queues": [{"name": "audit", "pendingCount": 1,
                    "failedCount": 0, "oldestAgeSeconds": self.backlog}]}
        if path.startswith("/api/search/"):
            if self.search_failure:
                raise urllib.error.HTTPError("https://example.test", 503, "secret body", {}, None)
            return {"hits": [{"versionId": VERSION}]}
        if path.startswith("/api/catalog/"):
            return {"id": VERSION, "publicationStatus": "published", "jurisdictionId": JURISDICTION}
        return "<p>All people are equal.</p>"


class CheckTest(unittest.TestCase):
    def test_search_failure_is_visible_while_reader_and_identity_are_healthy(self):
        result = check.content_checks(FakeClient(True), VERSION, JURISDICTION, "people", "All people are equal.")
        self.assertTrue(result[0]["ok"])
        self.assertFalse(result[1]["ok"])
        self.assertEqual(result[1]["reason"], "HTTP 503")
        self.assertNotIn("secret", json.dumps(result))

    def test_backlog_degrades_and_recovery_clears_it(self):
        self.assertTrue(all(not row["ok"] for row in check.queue_checks(FakeClient(backlog=301), 300, 0)))
        self.assertTrue(all(row["ok"] for row in check.queue_checks(FakeClient(backlog=0), 300, 0)))

    def test_malformed_status_cannot_pass(self):
        client = FakeClient()
        client.get = lambda *args, **kwargs: {"service": "identity", "queues": []}
        self.assertTrue(all(not row["ok"] for row in check.queue_checks(client, 300, 0)))

    def test_wrong_snapshot_or_ownership_cannot_pass(self):
        client = FakeClient()
        original = client.get
        client.get = lambda path, **kwargs: {"id": VERSION, "publicationStatus": "draft", "jurisdictionId": JURISDICTION} if path.startswith("/api/catalog/") else original(path, **kwargs)
        self.assertFalse(check.content_checks(client, VERSION, JURISDICTION, "people", "All people")[0]["ok"])

    def test_credentials_and_nonloopback_plaintext_origins_are_rejected(self):
        for value in ("http://example.test", "https://user:secret@example.test", "https://example.test/path", "https://example.test?token=secret"):
            with self.subTest(value=value), self.assertRaises(ValueError):
                check.Client(value)
        self.assertEqual(check.origin("http://127.0.0.1:18080/"), "http://127.0.0.1:18080")
        self.assertIsNone(check.NoRedirect().redirect_request(None, None, 302, "", {}, "https://elsewhere.test"))

    def test_verified_fresh_backup_and_corruption_and_staleness(self):
        with tempfile.TemporaryDirectory() as directory:
            backup = Path(directory) / "20261026-120000"
            backup.mkdir()
            created = dt.datetime(2026, 10, 26, 12, tzinfo=dt.timezone.utc).timestamp()
            (backup / "backup.meta").write_text("format=1\ncreated_at=2026-10-26T12:00:00Z\nwriter_policy=quiesced\n")
            checksums = []
            for name in check.DATABASES:
                data = b"SELECT 1;\n"
                (backup / (name + ".sql")).write_bytes(data)
                checksums.append(hashlib.sha256(data).hexdigest() + "  " + name + ".sql")
            (backup / "SHA256SUMS").write_text("\n".join(checksums) + "\n")
            self.assertTrue(check.backup_check(directory, 86400, created + 5)["ok"])
            self.assertFalse(check.backup_check(directory, 86400, created + 86401)["ok"])
            (backup / "document.sql").write_text("corrupted")
            self.assertFalse(check.backup_check(directory, 86400, created + 5)["ok"])


if __name__ == "__main__":
    unittest.main()
