import json
import os
import tempfile
import unittest
from io import BytesIO
from pathlib import Path
from unittest.mock import patch
from urllib.error import HTTPError

import check_request

REPOSITORY = "julianhoelz94/Verfassung"
SHA = "a" * 40
PUBLISHED = {"tag_name": "v.1.1", "draft": False, "published_at": "2026-10-27T10:00:00Z"}
REFERENCE = {"ref": "refs/tags/v.1.1", "object": {"type": "commit", "sha": SHA}}


class ReleaseRequestTests(unittest.TestCase):
    def test_explicit_tag_and_main_controller_required(self):
        for tag in ["", "refs/heads/main", "refs/tags/v.1.1", " v.1.1", "v.1.1\n"]:
            with self.subTest(tag=tag), self.assertRaises(ValueError):
                check_request.validate_request("workflow_dispatch", "refs/heads/main", "test", tag)
        with self.assertRaisesRegex(ValueError, "release_tag input"):
            check_request.validate_request("workflow_dispatch", "refs/tags/v.1.1", "test", "v.1.1")

    def test_lightweight_release_pins_tag_object_instead_of_target_branch(self):
        with patch.object(check_request, "github_get", side_effect=[{**PUBLISHED, "target_commitish": "main"}, REFERENCE]) as get:
            self.assertEqual(check_request.release_commit(REPOSITORY, "v.1.1", "token"), SHA)
        self.assertEqual([call.args[1] for call in get.call_args_list],
                         ["releases/tags/v.1.1", "git/ref/tags/v.1.1"])

    def test_annotated_and_nested_tags_resolve_to_commit(self):
        reference = {**REFERENCE, "object": {"type": "tag", "sha": "b" * 40}}
        with patch.object(check_request, "github_get", side_effect=[PUBLISHED, reference,
                {"object": {"type": "tag", "sha": "c" * 40}}, {"object": REFERENCE["object"]}]) as get:
            self.assertEqual(check_request.release_commit(REPOSITORY, "v.1.1", "token"), SHA)
        self.assertEqual(get.call_args_list[-1].args[1], "git/tags/" + "c" * 40)

    def test_slashes_in_tag_names_are_encoded_as_data(self):
        tag = "releases/v1.1"
        with patch.object(check_request, "github_get", side_effect=[{**PUBLISHED, "tag_name": tag},
                {**REFERENCE, "ref": "refs/tags/" + tag}]) as get:
            self.assertEqual(check_request.release_commit(REPOSITORY, tag, "token"), SHA)
        self.assertEqual(get.call_args_list[0].args[1], "releases/tags/releases%2Fv1.1")

    def test_draft_unpublished_or_wrong_release_is_rejected(self):
        for changes in [{"draft": True}, {"draft": None}, {"published_at": None}, {"tag_name": "v.1.0"}]:
            with self.subTest(changes=changes), patch.object(check_request, "github_get", return_value={**PUBLISHED, **changes}) as get:
                with self.assertRaisesRegex(ValueError, "published GitHub release"):
                    check_request.release_commit(REPOSITORY, "v.1.1", "token")
                self.assertEqual(get.call_count, 1)

    def test_nonrelease_tags_branches_hashes_and_deleted_tags_are_rejected(self):
        missing = HTTPError("https://api.github.com/", 404, "Not Found", {}, None)
        for tag in ["main", SHA, "unreleased"]:
            with self.subTest(tag=tag), patch.object(check_request, "github_get", side_effect=missing):
                with self.assertRaisesRegex(ValueError, "existing tag with a published GitHub release"):
                    check_request.release_commit(REPOSITORY, tag, "token")
        with patch.object(check_request, "github_get", side_effect=[PUBLISHED, missing]):
            with self.assertRaises(ValueError):
                check_request.release_commit(REPOSITORY, "v.1.1", "token")

    def test_api_errors_and_invalid_tag_objects_fail_closed(self):
        error = HTTPError("https://api.github.com/", 403, "Forbidden", {}, None)
        with patch.object(check_request, "github_get", side_effect=error):
            with self.assertRaises(HTTPError):
                check_request.release_commit(REPOSITORY, "v.1.1", "token")
        for reference in [{**REFERENCE, "ref": "refs/heads/v.1.1"},
                          {**REFERENCE, "object": {"type": "tree", "sha": SHA}},
                          {**REFERENCE, "object": {"type": "commit", "sha": "invalid"}}]:
            with self.subTest(reference=reference), patch.object(check_request, "github_get", side_effect=[PUBLISHED, reference]):
                with self.assertRaises(ValueError):
                    check_request.release_commit(REPOSITORY, "v.1.1", "token")
        recursive = {"object": {"type": "tag", "sha": SHA}}
        with patch.object(check_request, "github_get", side_effect=[PUBLISHED, {**REFERENCE, **recursive}] + [recursive] * 16):
            with self.assertRaisesRegex(ValueError, "Too many nested"):
                check_request.release_commit(REPOSITORY, "v.1.1", "token")

    def test_github_api_uses_read_token_and_admin_permissions(self):
        with patch.object(check_request.urllib.request, "urlopen", return_value=BytesIO(json.dumps({"permission": "admin"}).encode())) as open_url:
            check_request.require_admin(REPOSITORY, "release/admin", "token")
        request = open_url.call_args.args[0]
        self.assertTrue(request.full_url.endswith("/collaborators/release%2Fadmin/permission"))
        self.assertEqual(request.get_header("Authorization"), "Bearer token")
        check_request.require_admin(REPOSITORY, "JulianHoelz94", "token")

    def test_request_checks_both_actors_and_exports_only_resolved_sha(self):
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / "output"
            environment = {"DEPLOYMENT_ENVIRONMENT": "test", "RELEASE_TAG": "v.1.1", "GITHUB_EVENT_NAME": "workflow_dispatch",
                           "GITHUB_REF": "refs/heads/main", "GITHUB_REPOSITORY": REPOSITORY,
                           "GITHUB_ACTOR": "initial-admin", "GITHUB_TRIGGERING_ACTOR": "rerun-admin", "GH_TOKEN": "token",
                           "GITHUB_OUTPUT": str(output)}
            with patch.dict(os.environ, environment, clear=True), patch.object(check_request, "require_admin") as admin, \
                    patch.object(check_request, "release_commit", return_value=SHA):
                check_request.main()
            self.assertEqual({call.args[1] for call in admin.call_args_list}, {"initial-admin", "rerun-admin"})
            self.assertEqual(output.read_text(), f"source-sha={SHA}\n")
            with patch.dict(os.environ, environment, clear=True), patch.object(check_request, "require_admin", side_effect=PermissionError), \
                    patch.object(check_request, "release_commit") as resolve:
                with self.assertRaises(PermissionError):
                    check_request.main()
                resolve.assert_not_called()


if __name__ == "__main__":
    unittest.main()
