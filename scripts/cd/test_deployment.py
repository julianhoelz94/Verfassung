import argparse
import copy
import json
import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import Mock, patch

import yaml

import check_request
import deploy
import release
import render_compose

ROOT = Path(__file__).resolve().parents[2]
SHA = "a" * 40
REPOSITORY = "julianhoelz94/Verfassung"


def manifest(environment="test"):
    return {"schema": 1, "source_sha": SHA, "environment": environment,
            "public_url": release.PUBLIC_URLS[environment], "architecture": "amd64",
            "images": {name: f"ghcr.io/{REPOSITORY.lower()}/{name}@sha256:{'b' * 64}"
                       for name in release.image_paths(ROOT)}}


class FakeCoolify:
    """Documented API shapes, with persistent application identity between runs."""

    def __init__(self):
        self.application = None
        self.calls = []

    def request(self, method, path, payload=None, deploy=False):
        self.calls.append((method, path, payload, deploy))
        if method == "GET" and path == "/version":
            return "v4.5.0"
        if method == "GET" and path == "/projects/project/environments/test/envs":
            return [{"key": key} for key in globals()["deploy"].SHARED_VARIABLES]
        if method == "GET" and path == "/projects/project/test":
            return {"applications": [self.application] if self.application else []}
        if method == "POST" and path == "/applications/public":
            if self.application is not None:
                raise AssertionError("Duplicate application creation")
            self.application = {**payload, "uuid": "app123", "git_repository": REPOSITORY,
                                "settings": {"is_container_label_readonly_enabled": True},
                                "docker_compose_domains": {"edge-proxy": {"domain": release.PUBLIC_URLS["test"]}}}
            return {"uuid": "app123"}
        if method == "GET" and path == "/applications/app123":
            return self.application
        if method == "GET" and path == "/applications/app123/destinations":
            return [{"uuid": "destination", "server_uuid": "server", "is_primary": True}]
        if method == "PATCH" and path in {"/applications/app123", "/applications/app123/envs/bulk"}:
            return {}
        if method == "POST" and path == "/deploy":
            return {"deployments": [{"resource_uuid": "app123", "deployment_uuid": "job123"}]}
        raise AssertionError((method, path))


class ReleaseTests(unittest.TestCase):
    def test_cross_environment_revision_and_floating_image_rejected(self):
        valid = manifest()
        release.validate_manifest(valid, ROOT, REPOSITORY, "test", SHA)
        for field, value in [("environment", "prod"), ("source_sha", "c" * 40),
                             ("architecture", "arm64"), ("public_url", release.PUBLIC_URLS["prod"])]:
            candidate = {**valid, field: value}
            with self.subTest(field=field), self.assertRaises(ValueError):
                release.validate_manifest(candidate, ROOT, REPOSITORY, "test", SHA)
        for image in ["ghcr.io/other/repo/gateway-web@sha256:" + "b" * 64, "gateway:latest"]:
            candidate = copy.deepcopy(valid)
            candidate["images"]["gateway-web"] = image
            with self.assertRaises(ValueError):
                release.validate_manifest(candidate, ROOT, REPOSITORY, "test", SHA)
        del valid["images"]["edge-proxy"]
        with self.assertRaises(ValueError):
            release.validate_manifest(valid, ROOT, REPOSITORY, "test", SHA)



class AuthorizationTests(unittest.TestCase):
    def test_manual_tag_and_known_environment_required(self):
        self.assertEqual(check_request.validate_request("workflow_dispatch", "refs/tags/v.1.1", "prod"), "v.1.1")
        for event, ref, environment in [
            ("push", "refs/tags/v.1.1", "test"),
            ("workflow_dispatch", "refs/heads/main", "test"),
            ("workflow_dispatch", "refs/heads/other", "test"),
            ("workflow_dispatch", "refs/tags/v.1.1", "unknown"),
        ]:
            with self.assertRaises(ValueError):
                check_request.validate_request(event, ref, environment)

    def test_write_permission_is_insufficient(self):
        response = Mock()
        response.__enter__ = Mock(return_value=response)
        response.__exit__ = Mock(return_value=False)
        with patch.object(check_request.urllib.request, "urlopen", return_value=response), \
                patch.object(check_request.json, "load", return_value={"permission": "write"}):
            with self.assertRaises(PermissionError):
                check_request.require_admin(REPOSITORY, "collaborator", "token")



class CoolifyTests(unittest.TestCase):
    def test_production_credentials_are_independent_and_rotated_without_demo_seeding(self):
        first = {item["key"]: item["value"] for item in deploy.env_payload(manifest())["data"]}
        second = {item["key"]: item["value"] for item in deploy.env_payload(manifest())["data"]}
        credentials = [first["INGESTION_" + purpose + "_TOKEN"] for purpose in ("PUBLISH", "AUDIT", "SEARCH")]
        self.assertEqual(len(set(credentials)), 3)
        self.assertTrue(all(deploy.re.fullmatch(r"[A-Za-z0-9_-]{64}", value) for value in credentials))
        self.assertEqual(first["IDENTITY_SEED_MODE"], "off")
        self.assertNotIn("IDENTITY_SEED_INGESTION_PUBLISH_TOKEN", first)
        self.assertNotEqual(first["INGESTION_PUBLISH_TOKEN"], second["INGESTION_PUBLISH_TOKEN"])

    def test_private_origin_prevents_sending_credentials_to_public_hosts(self):
        for value in ["https://example.com", "http://100.64.0.1:8000/api/v1", "http://user@coolify:8000", "file://coolify"]:
            with self.assertRaises(ValueError):
                deploy.private_coolify_url(value)
        self.assertEqual(deploy.private_coolify_url("http://coolify:8000/"), "http://coolify:8000")

    def test_wrong_application_environment_server_repository_and_domain_rejected(self):
        app = {"build_pack": "dockercompose", "git_repository": REPOSITORY,
               "settings": {"is_container_label_readonly_enabled": True},
               "docker_compose_domains": json.dumps({"edge-proxy": {"domain": release.PUBLIC_URLS["test"]}})}
        destination = [{"server_uuid": "server", "is_primary": True}]
        project = {"applications": [{"uuid": "test-app"}]}
        for repository in [REPOSITORY, f"https://github.com/{REPOSITORY}.git"]:
            app["git_repository"] = repository
            api = Mock(request=Mock(side_effect=[project, app, destination]))
            deploy.validate_application(api, "project", "test-app", "server", "test", REPOSITORY)
        cases = [
            [{"applications": [{"uuid": "prod-app"}]}],
            [project, {**app, "git_repository": "https://example.org/" + REPOSITORY}],
            [project, {**app, "docker_compose_custom_build_command": "docker compose build"}],
            [project, {**app, "pre_deployment_command": "npm run build"}],
            [project, {**app, "settings": {"is_container_label_readonly_enabled": False}}],
            [project, {**app, "settings": {"is_container_label_readonly_enabled": True, "traefik_certificate_resolver": "none"}}],
            [project, app, [{"server_uuid": "other", "is_primary": True}]],
            [project, app, destination + [{"server_uuid": "server", "is_primary": False}]],
            [project, {**app, "docker_compose_domains": {"edge-proxy": {"domain": release.PUBLIC_URLS["prod"]}}}, destination],
            [project, {**app, "docker_compose_domains": {"identity-service": {"domain": "https://bypass.example.org"}}}, destination],
        ]
        for responses in cases:
            with self.subTest(responses=responses), self.assertRaises(ValueError):
                deploy.validate_application(Mock(request=Mock(side_effect=responses)), "project", "test-app", "server", "test", REPOSITORY)

    def test_first_run_creates_once_and_repeated_runs_keep_the_application(self):
        api = FakeCoolify()
        for _ in range(2):
            self.assertEqual(deploy.ensure_application(api, "project", "server", "test", REPOSITORY, manifest()), "app123")
        creates = [call for call in api.calls if call[:2] == ("POST", "/applications/public")]
        self.assertEqual(len(creates), 1)
        payload = creates[0][2]
        self.assertEqual(payload["name"], "constitution-atlas-test")
        self.assertEqual(payload["server_uuid"], "server")
        self.assertEqual(payload["environment_name"], "test")
        self.assertEqual(payload["git_commit_sha"], SHA)
        self.assertFalse(payload["instant_deploy"])
        self.assertFalse(payload["is_auto_deploy_enabled"])
        self.assertFalse(payload["is_preview_deployments_enabled"])
        self.assertEqual(payload["docker_compose_domains"], [{"name": "edge-proxy", "domain": release.PUBLIC_URLS["test"] + ":80", "redirect": "both"}])
        self.assertFalse(any(path == "/deploy" for _, path, _, _ in api.calls))

    def test_existing_resources_are_not_duplicated_or_selected_ambiguously(self):
        candidates = [
            [{"uuid": "first", "name": "constitution-atlas-test"}, {"uuid": "second", "name": "constitution-atlas-test"}],
            [{"uuid": "previous", "name": "legacy-name", "git_repository": REPOSITORY}],
        ]
        for applications in candidates:
            api = Mock(request=Mock(return_value={"applications": applications}))
            with self.subTest(applications=applications), self.assertRaises(ValueError):
                deploy.ensure_application(api, "project", "server", "test", REPOSITORY, manifest())
            self.assertEqual(api.request.call_count, 1)
        api = Mock(request=Mock(return_value={"message": "Unexpected response"}))
        with self.assertRaisesRegex(ValueError, "application list"):
            deploy.ensure_application(api, "project", "server", "test", REPOSITORY, manifest())
        self.assertEqual(api.request.call_count, 1)
        api = FakeCoolify()
        api.application = {"uuid": "app123", "name": "legacy-name", "build_pack": "dockercompose",
                           "git_repository": REPOSITORY, "docker_compose_domains": {},
                           "settings": {"is_container_label_readonly_enabled": True}}
        self.assertEqual(deploy.ensure_application(api, "project", "server", "test", REPOSITORY, manifest(), "app123"), "app123")
        self.assertTrue(all(method == "GET" for method, _, _, _ in api.calls))

    def test_unknown_create_result_is_not_retried(self):
        api = Mock(request=Mock(side_effect=[{"applications": []}, TimeoutError("lost response")]))
        with self.assertRaises(TimeoutError):
            deploy.ensure_application(api, "project", "server", "test", REPOSITORY, manifest())
        self.assertEqual(api.request.call_count, 2)

    def test_compose_loading_wait_retries_only_the_known_readiness_error(self):
        api = Mock(request=Mock(side_effect=[deploy.ComposeNotLoaded("loading"), {}]))
        sleep = Mock()
        deploy.configure_application(api, "app123", manifest(), sleep=sleep)
        self.assertEqual(api.request.call_count, 2)
        sleep.assert_called_once_with(5)
        api = Mock(request=Mock(side_effect=RuntimeError("validation failure")))
        with self.assertRaises(RuntimeError):
            deploy.configure_application(api, "app123", manifest(), sleep=sleep)
        self.assertEqual(api.request.call_count, 1)
        api = Mock(request=Mock(side_effect=deploy.ComposeNotLoaded("loading")))
        with self.assertRaises(TimeoutError):
            deploy.configure_application(api, "app123", manifest(), timeout=2, sleep=lambda _: None, now=Mock(side_effect=[0, 1, 3]))

    def test_api_readiness_classification_never_exposes_response_secrets(self):
        from io import BytesIO
        from urllib.error import HTTPError
        for message, exception in [(deploy.COMPOSE_NOT_LOADED, deploy.ComposeNotLoaded), ("private-secret", RuntimeError)]:
            body = json.dumps({"errors": {"docker_compose_domains": message}, "secret": "private-secret"}).encode()
            api = deploy.Api("http://coolify:8000", "config", "deploy")
            api.opener = Mock(open=Mock(side_effect=HTTPError("private", 422, "private-secret", {}, BytesIO(body))))
            with self.assertRaises(exception) as context:
                api.request("PATCH", "/applications/app", {})
            self.assertNotIn("private-secret", str(context.exception))

    def test_released_api_payload_omits_unsupported_settings(self):
        payload = deploy.application_settings(manifest())
        self.assertNotIn("is_container_label_readonly_enabled", payload)
        self.assertNotIn("traefik_certificate_resolver", payload)

    def test_api_reports_only_known_validation_fields_and_static_reasons(self):
        from io import BytesIO
        from urllib.error import HTTPError
        body = json.dumps({"errors": {
            "is_container_label_readonly_enabled": ["This field is not allowed."],
            "git_repository": ["private-secret is invalid"],
            "private-secret": ["This field is not allowed."],
        }}).encode()
        api = deploy.Api("http://coolify:8000", "config", "deploy")
        api.opener = Mock(open=Mock(side_effect=HTTPError("private", 422, "private-secret", {}, BytesIO(body))))
        with self.assertRaises(RuntimeError) as context:
            api.request("POST", "/applications/public", {
                "is_container_label_readonly_enabled": True, "git_repository": "private-secret"})
        self.assertIn("is_container_label_readonly_enabled: This field is not allowed.", str(context.exception))
        self.assertIn("git_repository: Validation failed.", str(context.exception))
        self.assertNotIn("private-secret", str(context.exception))

    def test_version_accepts_text_or_json_string_but_never_prints_arbitrary_responses(self):
        from io import BytesIO
        for body in [b'v4.5.0', b'"v4.5.0"', b'4.0.0-beta.420.7']:
            api = deploy.Api("http://coolify:8000", "config", "deploy")
            api.opener = Mock(open=Mock(return_value=BytesIO(body)))
            self.assertRegex(api.request("GET", "/version"), r"^v?4\.")
        api.opener = Mock(open=Mock(return_value=BytesIO(b'private-secret')))
        with self.assertRaises(ValueError) as context:
            api.request("GET", "/version")
        self.assertNotIn("private-secret", str(context.exception))

    def test_shared_variable_presence_checked_without_reading_secret_values(self):
        api = Mock(request=Mock(return_value=[{"key": key} for key in deploy.SHARED_VARIABLES]))
        deploy.require_shared_variables(api, "project", "test")
        api.request.assert_called_once_with("GET", "/projects/project/environments/test/envs")
        api.request.return_value = [{"key": "POSTGRES_PASSWORD"}]
        with self.assertRaisesRegex(ValueError, "IDENTITY_MFA_ENCRYPTION_KEY"):
            deploy.require_shared_variables(api, "project", "test")

    def test_api_keeps_config_and_deploy_tokens_separate(self):
        api = deploy.Api("http://coolify:8000", "config-secret", "deploy-secret")
        requests = []
        def open_request(request, timeout):
            requests.append(request)
            from io import BytesIO
            return BytesIO(b'{}')
        api.opener = Mock(open=open_request)
        api.request("GET", "/applications/app")
        api.request("POST", "/deploy", {"uuid": "app"}, deploy=True)
        self.assertEqual([request.get_header("Authorization") for request in requests],
                         ["Bearer config-secret", "Bearer deploy-secret"])
        self.assertEqual(requests[1].full_url, "http://coolify:8000/api/v1/deploy")

    def test_poll_requires_success_and_exact_commit(self):
        for status, commit in [("failed", SHA), ("finished", "c" * 40), ("cancelled", SHA)]:
            with self.subTest(status=status), self.assertRaises(RuntimeError):
                deploy.wait_for_deployment(Mock(request=Mock(return_value={"status": status, "commit": commit})), "deployment", SHA)
        api = Mock()
        api.request.side_effect = [{"status": "in_progress"}, {"status": "finished", "commit": SHA}]
        deploy.wait_for_deployment(api, "deployment", SHA, sleep=lambda _: None)

    def test_deploy_bootstraps_configures_and_only_then_uses_deploy_token(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "manifest.json"
            path.write_text(json.dumps(manifest()))
            args = argparse.Namespace(manifest=path, repository=REPOSITORY, environment="test", source_sha=SHA)
            api = FakeCoolify()
            settings = {"COOLIFY_URL": "http://coolify:8000", "COOLIFY_PROJECT_UUID": "project",
                        "COOLIFY_SERVER_UUID": "server", "COOLIFY_CONFIG_TOKEN": "config", "COOLIFY_DEPLOY_TOKEN": "deploy"}
            with patch.dict(os.environ, settings, clear=True), patch.object(deploy, "Api", return_value=api), \
                    patch.object(deploy, "wait_for_deployment"), patch.object(deploy, "smoke_check"):
                deploy.deploy(args)
            self.assertEqual(api.calls[-1], ("POST", "/deploy", {"uuid": "app123"}, True))
            self.assertTrue(all(not use_deploy for _, _, _, use_deploy in api.calls[:-1]))
            payload = next(payload["data"] for method, route, payload, _ in api.calls if route.endswith("/envs/bulk"))
            images = [item["value"] for item in payload if item["key"].startswith("ATLAS_IMAGE_")]
            self.assertEqual(set(images), set(manifest()["images"].values()))
            values = {item["key"]: item for item in payload}
            for key in deploy.SHARED_VARIABLES:
                self.assertEqual(values[key]["value"], "{{environment." + key + "}}")
            self.assertTrue(all(item["is_buildtime"] and item["is_runtime"] and item["is_literal"] for item in payload))
            required = set(deploy.re.findall(r"\$\{([A-Z_]+):\?", (ROOT / "docker-compose.coolify.yml").read_text()))
            self.assertFalse(required - set(values))

    def test_missing_shared_variables_prevents_creation_and_deployment(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "manifest.json"
            path.write_text(json.dumps(manifest()))
            args = argparse.Namespace(manifest=path, repository=REPOSITORY, environment="test", source_sha=SHA)
            api = Mock(request=Mock(return_value=[]))
            settings = {"COOLIFY_URL": "http://coolify:8000", "COOLIFY_PROJECT_UUID": "project",
                        "COOLIFY_SERVER_UUID": "server", "COOLIFY_CONFIG_TOKEN": "config", "COOLIFY_DEPLOY_TOKEN": "deploy"}
            with patch.dict(os.environ, settings, clear=True), patch.object(deploy, "Api", return_value=api):
                with self.assertRaisesRegex(ValueError, "shared variables"):
                    deploy.deploy(args)
            self.assertEqual(api.request.call_count, 1)
            self.assertEqual(api.request.call_args.args[0], "GET")



class RuntimeTests(unittest.TestCase):
    def test_runtime_has_no_host_ports_builds_or_checkout_mounts(self):
        document = yaml.safe_load(render_compose.render(ROOT))
        self.assertNotIn("backup-service", document["services"])
        for name, service in document["services"].items():
            with self.subTest(service=name):
                self.assertNotIn("ports", service)
                self.assertNotIn("build", service)
                for volume in service.get("volumes", []):
                    self.assertFalse(volume.startswith("."))
        identity = document["services"]["identity-service"]["environment"]
        self.assertEqual(identity["IDENTITY_SEED_MODE"], "off")
        self.assertNotIn("LOCAL_ADMIN_PASSWORD", identity)
        self.assertIn(":?", identity["IDENTITY_MFA_ENCRYPTION_KEY"])

    def test_workflow_is_manual_with_opt_in_prepopulate_and_no_test_workflow(self):
        # BaseLoader preserves YAML's 'on' key instead of treating it as a YAML 1.1 boolean.
        workflow = yaml.load((ROOT / ".github/workflows/deploy.yml").read_text(), Loader=yaml.BaseLoader)
        self.assertEqual(set(workflow["on"]), {"workflow_dispatch"})
        inputs = workflow["on"]["workflow_dispatch"]["inputs"]
        self.assertEqual(set(inputs), {"environment", "prepopulate"})
        self.assertEqual(inputs["prepopulate"]["default"], "false")
        self.assertEqual(set(workflow["jobs"]), {"authorize", "build-image", "candidate-images", "deploy"})
        for job in workflow["jobs"].values():
            self.assertNotIn("uses", job)
        steps = workflow["jobs"]["deploy"]["steps"]
        populate = next(step for step in steps if step.get("run") == "npm run prepopulate")
        self.assertEqual(populate["if"], "inputs.prepopulate")

    def test_release_commit_is_used_for_ci_build_collection_and_deployment(self):
        workflow = yaml.load((ROOT / ".github/workflows/deploy.yml").read_text(), Loader=yaml.BaseLoader)
        jobs = workflow["jobs"]
        self.assertIn("${{ github.ref_name }}", workflow["run-name"])
        self.assertEqual(jobs["authorize"]["outputs"]["source-sha"], "${{ steps.release.outputs.source-sha }}")
        for name, job in jobs.items():
            with self.subTest(job=name):
                checkouts = [step["with"] for step in job["steps"]
                             if step.get("uses", "").startswith("actions/checkout@")]
                self.assertEqual(len(checkouts), 1)
                self.assertEqual(checkouts[0]["ref"], "${{ github.sha }}")
                expected = "${{ steps.release.outputs.source-sha }}" if name == "authorize" else "${{ needs.authorize.outputs.source-sha }}"
                self.assertNotIn("path", checkouts[0])
                for step in job["steps"]:
                    command = step.get("run", "")
                    if "--source-sha" in command:
                        self.assertIn('--source-sha "$SOURCE_SHA"', command)
                        environment = {**job.get("env", {}), **step.get("env", {})}
                        self.assertEqual(environment["SOURCE_SHA"], expected)
                        directory = step.get("working-directory", job.get("defaults", {}).get("run", {}).get("working-directory"))
                        self.assertIsNone(directory)
                        self.assertIn("python3 scripts/cd/", command)
                        self.assertNotIn("$GITHUB_SHA", command)
        populate = next(step for step in jobs["deploy"]["steps"] if step.get("run") == "npm run prepopulate")
        self.assertEqual(populate["working-directory"], "apps/gateway-web")


if __name__ == "__main__":
    unittest.main()
