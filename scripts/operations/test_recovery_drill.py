import os
import subprocess
import hashlib
import json
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from threading import Thread
import unittest
from unittest.mock import patch

from recovery_drill import Client, DATABASES, document_snapshot, validate_target, verify_fixture_readback


def config(project="verfassung-recovery-test"):
    services = {name + "-service": {"environment": {
        "SPRING_PROFILES_ACTIVE": "ci", "IDENTITY_MFA_ENCRYPTION_KEY": "fixture-only"}}
        for name in DATABASES}
    services.update({name + "-db": {"volumes": [{"type": "volume", "source": name}]} for name in DATABASES})
    return {"name": project, "services": services,
            "volumes": {name: {"name": project + "_" + name} for name in DATABASES}}


class RecoveryTargetTest(unittest.TestCase):
    def test_explicit_disposable_stack_is_allowed(self):
        validate_target("verfassung-recovery-test", "verfassung-recovery-test", "http://localhost:18080", config())

    def test_live_names_remote_origins_and_unconfirmed_targets_are_rejected(self):
        for project, confirmation, url in [("verfassung", "verfassung", "http://localhost"),
                                           ("verfassung-recovery-test", "", "http://localhost"),
                                           ("verfassung-recovery-test", "verfassung-recovery-test", "https://example.test")]:
            with self.subTest(project=project, url=url), self.assertRaises(ValueError):
                validate_target(project, confirmation, url, config(project))

    def test_production_profile_or_external_volume_is_rejected(self):
        for field in ("production", "external", "shared", "wrong-project", "bind"):
            value = config()
            if field == "production":
                value["services"]["identity-service"]["environment"]["SPRING_PROFILES_ACTIVE"] = "production"
            elif field == "external":
                value["volumes"]["catalog"]["external"] = True
            elif field == "shared":
                value["volumes"]["catalog"]["name"] = "verfassung_catalog"
            elif field == "bind":
                value["services"]["catalog-db"]["volumes"][0]["type"] = "bind"
            else:
                value["name"] = "verfassung"
            with self.subTest(field=field), self.assertRaises(ValueError):
                validate_target("verfassung-recovery-test", "verfassung-recovery-test", "http://localhost", value)

    def test_ci_exception_requires_real_ci_environment(self):
        with patch.dict(os.environ, {}, clear=True), self.assertRaises(ValueError):
            validate_target("full-stack-e2e", "full-stack-e2e", "http://localhost", config("full-stack-e2e"))
        with patch.dict(os.environ, {"CI": "true"}, clear=True):
            validate_target("full-stack-e2e", "full-stack-e2e", "http://localhost", config("full-stack-e2e"))


class FixtureReadbackTest(unittest.TestCase):
    def test_readback_is_read_only_and_reports_the_failing_fixture(self):
        with patch("recovery_drill.subprocess.run", return_value=subprocess.CompletedProcess([], 0, "", "")) as run:
            verify_fixture_readback("node", "http://localhost:18080")
            self.assertEqual(run.call_args.args[0], ["node", "e2e/fixtures/prepopulate.mjs", "--verify-only"])
            self.assertEqual(run.call_args.kwargs["env"]["PREPOPULATE_BASE_URL"], "http://localhost:18080")
        with patch("recovery_drill.subprocess.run", return_value=subprocess.CompletedProcess([], 1, "", "AssertionError: missing fixture")):
            with self.assertRaisesRegex(RuntimeError, "AssertionError: missing fixture"):
                verify_fixture_readback("node", "http://localhost:18080")


class DocumentRecoveryTest(unittest.TestCase):
    def test_pinned_file_digest_detects_changed_bytes_and_wrong_revision(self):
        document_id = "01900000-0000-4000-8000-000000000001"
        state = {"bytes": b"original source\xff\x00", "revision": 2}

        class Handler(BaseHTTPRequestHandler):
            def do_GET(self):
                self.send_response(200)
                self.end_headers()
                if self.path.endswith("/revisions/2/file"):
                    self.wfile.write(state["bytes"])
                else:
                    self.wfile.write(json.dumps({"id": document_id, "revision": {
                        "documentId": document_id, "revision": state["revision"]}}).encode())

            def log_message(self, *args):
                pass

        server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        worker = Thread(target=server.serve_forever, daemon=True)
        worker.start()
        try:
            client = Client(f"http://127.0.0.1:{server.server_port}")
            original = document_snapshot(client, document_id, 2)
            self.assertEqual(original["sha256"], hashlib.sha256(state["bytes"]).hexdigest())
            self.assertEqual(original, document_snapshot(client, document_id, 2))
            state["bytes"] = b"changed source\xff\x00"
            self.assertNotEqual(original, document_snapshot(client, document_id, 2))
            state["revision"] = 3
            with self.assertRaises(ValueError):
                document_snapshot(client, document_id, 2)
        finally:
            server.shutdown()
            server.server_close()
            worker.join()


if __name__ == "__main__":
    unittest.main()
