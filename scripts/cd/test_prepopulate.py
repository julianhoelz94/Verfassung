import contextlib
import io
import os
import tempfile
import unittest
import urllib.error
from urllib.parse import parse_qs, urlsplit
from pathlib import Path
from unittest.mock import Mock, patch

import prepopulate

REPOSITORY = "julianhoelz94/Verfassung"
SHA = "a" * 40


def credentials(profile="compact"):
    env = {"PREPOPULATE": "true", "PREPOPULATE_PROFILE": profile,
           "PREPOPULATE_TOTP_SECRET": "admin-key", "PREPOPULATE_PUBLISHER_TOTP_SECRET": "publisher-key",
           "PREPOPULATE_EDITOR_TOTP_SECRET": "editor-key"}
    for role in ("ADMIN", "REVIEWER", "PUBLISHER", "EDITOR", "VIEWER"):
        env[f"PREPOPULATE_{role}_EMAIL"] = role.lower() + "@example.test"
        env[f"PREPOPULATE_{role}_PASSWORD"] = "private-" + role
    return env


def artifact(identifier=10, run=20, created="2026-10-30T10:00:00Z", name="prepopulate-state-test", expired=False):
    return {"id": identifier, "name": name, "created_at": created, "expired": expired,
            "workflow_run": {"id": run, "head_sha": SHA}}


def deployment(**overrides):
    return {"workflow_id": 123, "event": "workflow_dispatch", "head_repository": {"full_name": REPOSITORY},
            "head_branch": "v1", "head_sha": SHA, **overrides}


class FixtureCredentialsTest(unittest.TestCase):
    def test_disabled_prepopulation_needs_no_fixture_secrets(self):
        prepopulate.validate_credentials({})
        prepopulate.validate_credentials({"PREPOPULATE": "false", "PREPOPULATE_PROFILE": "unused"})
        with self.assertRaises(ValueError):
            prepopulate.validate_credentials({"PREPOPULATE": "yes"})

    def test_compact_requires_three_accounts_and_mandatory_totp_only(self):
        env = credentials()
        for key in list(env):
            if key.startswith(("PREPOPULATE_EDITOR_", "PREPOPULATE_VIEWER_")):
                del env[key]
        prepopulate.validate_credentials(env)
        for key in ("PREPOPULATE_ADMIN_PASSWORD", "PREPOPULATE_TOTP_SECRET", "PREPOPULATE_PUBLISHER_TOTP_SECRET"):
            with self.subTest(key=key), self.assertRaisesRegex(ValueError, key):
                prepopulate.validate_credentials({**env, key: ""})

    def test_extended_and_scale_require_editor_and_viewer_and_separate_accounts(self):
        for profile in ("extended", "scale"):
            env = credentials(profile)
            prepopulate.validate_credentials(env)
            for key in ("PREPOPULATE_EDITOR_EMAIL", "PREPOPULATE_VIEWER_PASSWORD", "PREPOPULATE_EDITOR_TOTP_SECRET"):
                with self.subTest(profile=profile, key=key), self.assertRaisesRegex(ValueError, key):
                    prepopulate.validate_credentials({**env, key: ""})
            with self.assertRaisesRegex(ValueError, "separate fixture accounts"):
                prepopulate.validate_credentials({**env, "PREPOPULATE_VIEWER_EMAIL": env["PREPOPULATE_ADMIN_EMAIL"].upper()})
        with self.assertRaisesRegex(ValueError, "profile"):
            prepopulate.validate_credentials(credentials("typo"))
        with self.assertRaises(ValueError) as error:
            prepopulate.validate_credentials({**credentials(), "PREPOPULATE_ADMIN_EMAIL": ""})
        self.assertNotIn("private-PUBLISHER", str(error.exception))


class FixtureStateTest(unittest.TestCase):
    def locate(self, artifacts, runs=None, resolve=None):
        runs = runs or {20: deployment()}
        def get(repository, path, token):
            self.assertEqual(repository, REPOSITORY)
            if path == "actions/workflows/deploy.yml":
                return {"id": 123}
            if path.startswith("actions/artifacts?"):
                self.assertIn("name=prepopulate-state-test", path)
                return {"artifacts": artifacts}
            return runs[int(path.rsplit("/", 1)[1])]
        return prepopulate.find_state(REPOSITORY, "test", "token", get, resolve or (lambda *args: SHA))

    def test_absent_state_is_a_fresh_start_and_invalid_environment_is_rejected(self):
        self.assertIsNone(self.locate([]))
        with self.assertRaisesRegex(ValueError, "test or prod"):
            prepopulate.find_state(REPOSITORY, "typo", "token")

    def test_latest_checkpoint_uses_creation_time_including_reruns(self):
        state = self.locate([artifact(999, 100, "2026-10-29T10:00:00Z"),
                             artifact(17, 90, "2026-10-30T10:00:00Z")], {90: deployment(), 100: deployment()})
        self.assertEqual(state, {"run-id": "90", "artifact-id": "17"})

    def test_untrusted_workflows_forks_other_environments_and_unpublished_refs_are_ignored(self):
        for bad in (deployment(event="pull_request"), deployment(workflow_id=99),
                    deployment(head_repository={"full_name": "other/repo"}), deployment(head_sha="b" * 40),
                    deployment(head_branch="unpublished")):
            def resolve(repository, tag, token):
                if tag == "unpublished":
                    raise ValueError("no published release")
                return SHA
            items = [artifact(30, 21, "2026-10-31T10:00:00Z"), artifact()]
            with self.subTest(run=bad):
                self.assertEqual(self.locate(items, {20: deployment(), 21: bad}, resolve), {"run-id": "20", "artifact-id": "10"})
        self.assertIsNone(self.locate([artifact(name="prepopulate-state-prod")]))
        self.assertIsNone(self.locate([{**artifact(), "workflow_run": {"id": 20, "head_sha": "b" * 40}}]))
        self.assertIsNone(self.locate([artifact(run="not-an-id")]))

    def test_expired_latest_state_does_not_silently_restore_an_older_checkpoint(self):
        with self.assertRaisesRegex(ValueError, "expired"):
            self.locate([artifact(11, 20, "2026-10-31T10:00:00Z", expired=True), artifact()])
        with self.assertRaisesRegex(ValueError, "artifact ID"):
            self.locate([artifact(identifier="invalid")])

    def test_missing_release_can_be_skipped_but_api_authorization_errors_are_not_hidden(self):
        missing = lambda *args: (_ for _ in ()).throw(urllib.error.HTTPError("url", 404, "missing", {}, None))
        self.assertIsNone(self.locate([artifact()], resolve=missing))
        forbidden = lambda *args: (_ for _ in ()).throw(urllib.error.HTTPError("url", 403, "denied", {}, None))
        with self.assertRaises(urllib.error.HTTPError):
            self.locate([artifact()], resolve=forbidden)

    def test_repository_artifacts_are_paginated(self):
        def get(repository, path, token):
            if path == "actions/workflows/deploy.yml":
                return {"id": 123}
            query = parse_qs(urlsplit(path).query)
            if query.get("page") == ["1"]:
                return {"artifacts": [artifact(name="prepopulate-state-prod")] * 100}
            if query.get("page") == ["2"]:
                return {"artifacts": [artifact()]}
            return deployment()
        self.assertEqual(prepopulate.find_state(REPOSITORY, "test", "token", get, lambda *args: SHA)["artifact-id"], "10")
        with self.assertRaisesRegex(ValueError, "pagination"):
            prepopulate.find_state(REPOSITORY, "test", "token", lambda *args: {"id": 123, "artifacts": [artifact()] * 100})

    def test_cli_outputs_only_validated_artifact_identifiers(self):
        for state in (None, {"run-id": "20", "artifact-id": "10"}):
            with tempfile.TemporaryDirectory() as directory, patch.dict(os.environ, {
                "GITHUB_REPOSITORY": REPOSITORY, "DEPLOYMENT_ENVIRONMENT": "test", "GH_TOKEN": "private-token",
                "GITHUB_OUTPUT": str(Path(directory) / "output")}, clear=True), \
                    patch("sys.argv", ["prepopulate.py", "--find-state"]), patch.object(prepopulate, "find_state", return_value=state), \
                    contextlib.redirect_stdout(io.StringIO()) as output:
                prepopulate.main()
                saved = (Path(directory) / "output").read_text()
                self.assertIn("state-found=" + ("true" if state else "false"), saved)
                if state:
                    self.assertIn("artifact-id=10", saved)
                self.assertNotIn("private-token", output.getvalue() + saved)
        with patch("sys.argv", ["prepopulate.py"]), patch.dict(os.environ, {}, clear=True), \
                patch.object(prepopulate, "github_get", Mock(side_effect=AssertionError("must not call GitHub"))):
            prepopulate.main()


if __name__ == "__main__":
    unittest.main()
