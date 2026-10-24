import argparse
import copy
import json
import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import Mock, patch

import yaml

import build_images
import check_ci
import check_request
import deploy
import prune_volumes
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

    def test_build_is_native_amd64_and_never_runs_tests(self):
        def run(*args, **kwargs):
            if args[:3] == ("docker", "image", "inspect"):
                return Mock(stdout=json.dumps([args[3].split(":")[0] + "@sha256:" + "b" * 64]))
            return Mock()
        with patch.object(build_images.platform, "machine", return_value="x86_64"), \
                patch.object(build_images, "command", side_effect=run) as command, \
                patch.object(build_images, "write_manifest") as write:
            build_images.build(ROOT, REPOSITORY, "prod", SHA, "123-1")
        self.assertEqual(write.call_args.args[1]["architecture"], "amd64")
        gradle_calls = [call.args for call in command.call_args_list if call.args[0].endswith("gradlew")]
        self.assertEqual(len(gradle_calls), 9)
        self.assertTrue(all(call[-3:] == ("bootJar", "-x", "test") for call in gradle_calls))
        docker_calls = [call.args for call in command.call_args_list if call.args[:2] == ("docker", "build")]
        self.assertTrue(all(call[3] == "linux/amd64" for call in docker_calls))


class AuthorizationTests(unittest.TestCase):
    def test_manual_main_and_matching_prune_confirmation_required(self):
        check_request.validate_request("workflow_dispatch", "refs/heads/main", "prod", False, "")
        for event, ref, environment, prune, confirmation in [
            ("push", "refs/heads/main", "test", False, ""),
            ("workflow_dispatch", "refs/heads/other", "test", False, ""),
            ("workflow_dispatch", "refs/heads/main", "prod", True, "PRUNE test"),
        ]:
            with self.assertRaises(ValueError):
                check_request.validate_request(event, ref, environment, prune, confirmation)

    def test_write_permission_is_insufficient(self):
        response = Mock()
        response.__enter__ = Mock(return_value=response)
        response.__exit__ = Mock(return_value=False)
        with patch.object(check_request.urllib.request, "urlopen", return_value=response), \
                patch.object(check_request.json, "load", return_value={"permission": "write"}):
            with self.assertRaises(PermissionError):
                check_request.require_admin(REPOSITORY, "collaborator", "token")

    def test_ci_exact_sha_latest_attempt_and_no_e2e_gate(self):
        jobs = [{"name": name, "status": "completed", "conclusion": "success"}
                for name in ["frontend", "mcp-server", "gateway-image", "full-stack-service-artifacts"]]
        jobs += [{"name": f"images ({name})", "status": "completed", "conclusion": "success"}
                 for name, directory in release.image_paths(ROOT).items()
                 if (ROOT / directory / "build.gradle.kts").is_file()]
        jobs.append({"name": "full-stack-e2e", "status": "completed", "conclusion": "failure"})
        runs = [{"id": 1, "head_sha": SHA, "head_branch": "main", "event": "push"}]
        get = Mock(side_effect=lambda path: {"jobs": jobs} if "/jobs?" in path else {"workflow_runs": runs})
        self.assertEqual(check_ci.check(REPOSITORY, SHA, ROOT, get), 1)
        self.assertIn("head_sha=" + SHA, get.call_args_list[0].args[0])
        self.assertIn("filter=latest", get.call_args_list[1].args[0])
        jobs[0]["conclusion"] = "failure"
        with self.assertRaises(ValueError):
            check_ci.check(REPOSITORY, SHA, ROOT, get)
        runs[0]["head_sha"] = "c" * 40
        with self.assertRaises(ValueError):
            check_ci.check(REPOSITORY, SHA, ROOT, get)


class CoolifyTests(unittest.TestCase):
    def test_private_origin_prevents_sending_credentials_to_public_hosts(self):
        for value in ["https://example.com", "http://100.64.0.1:8000/api/v1", "http://user@coolify:8000", "file://coolify"]:
            with self.assertRaises(ValueError):
                deploy.private_coolify_url(value)
        self.assertEqual(deploy.private_coolify_url("http://coolify:8000/"), "http://coolify:8000")

    def test_wrong_application_environment_and_domain_rejected(self):
        app = {"build_pack": "dockercompose", "git_repository": f"https://github.com/{REPOSITORY}.git",
               "docker_compose_domains": json.dumps({"edge-proxy": {"domain": release.PUBLIC_URLS["test"] + ":80"}})}
        api = Mock()
        api.request.side_effect = [{"applications": [{"uuid": "test-app"}]}, app]
        deploy.validate_application(api, "project", "test-app", "test", REPOSITORY)
        api.request.side_effect = [{"applications": [{"uuid": "prod-app"}]}]
        with self.assertRaises(ValueError):
            deploy.validate_application(api, "project", "test-app", "test", REPOSITORY)
        api.request.side_effect = [{"applications": [{"uuid": "test-app"}]}, app]
        with self.assertRaises(ValueError):
            deploy.validate_application(api, "project", "test-app", "prod", REPOSITORY)
        app["docker_compose_domains"] = {"edge-proxy": {"domain": release.PUBLIC_URLS["test"]},
                                        "identity-service": {"domain": "https://bypass.example.org"}}
        api.request.side_effect = [{"applications": [{"uuid": "test-app"}]}, app]
        with self.assertRaises(ValueError):
            deploy.validate_application(api, "project", "test-app", "test", REPOSITORY)

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

    def test_deploy_uses_immutable_images_and_does_not_prune_by_default(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "manifest.json"
            path.write_text(json.dumps(manifest()))
            args = argparse.Namespace(manifest=path, repository=REPOSITORY, environment="test",
                                      source_sha=SHA, prune_volumes=False, prune_confirmation="")
            api = Mock()
            api.request.return_value = {"deployments": [{"resource_uuid": "test-app", "deployment_uuid": "job123"}]}
            settings = {"COOLIFY_URL": "http://coolify:8000", "COOLIFY_PROJECT_UUID": "project",
                        "COOLIFY_APP_UUID": "test-app", "COOLIFY_CONFIG_TOKEN": "config", "COOLIFY_DEPLOY_TOKEN": "deploy"}
            with patch.dict(os.environ, settings, clear=True), patch.object(deploy, "Api", return_value=api), \
                    patch.object(deploy, "validate_application"), patch.object(deploy, "wait_for_deployment"), \
                    patch.object(deploy, "smoke_check"), patch.object(deploy, "prune") as prune:
                deploy.deploy(args)
                prune.assert_not_called()
                self.assertTrue(api.request.call_args.kwargs["deploy"])
                payload = api.request.call_args_list[1].args[2]["data"]
                images = [item["value"] for item in payload if item["key"].startswith("ATLAS_IMAGE_")]
                self.assertEqual(set(images), set(manifest()["images"].values()))
                api.request.reset_mock()
                args.prune_volumes = True
                args.prune_confirmation = "PRUNE prod"
                with self.assertRaises(ValueError):
                    deploy.deploy(args)
                api.request.assert_not_called()


class RuntimeAndMaintenanceTests(unittest.TestCase):
    def test_runtime_has_no_host_ports_builds_or_checkout_mounts(self):
        document = yaml.safe_load(render_compose.render(ROOT))
        self.assertNotIn("backup-service", document["services"])
        for name, service in document["services"].items():
            with self.subTest(service=name):
                self.assertNotIn("ports", service)
                self.assertNotIn("build", service)
                for volume in service.get("volumes", []):
                    self.assertFalse(volume.startswith("."))
        for definition in document["volumes"].values():
            self.assertIn("io.constitution-atlas.deployment", definition["labels"])
        identity = document["services"]["identity-service"]["environment"]
        self.assertEqual(identity["IDENTITY_SEED_MODE"], "off")
        self.assertNotIn("LOCAL_ADMIN_PASSWORD", identity)
        self.assertIn(":?", identity["IDENTITY_MFA_ENCRYPTION_KEY"])

    def test_prune_uses_single_composite_label_and_rejects_shell_commands(self):
        with tempfile.TemporaryDirectory() as directory, patch.object(prune_volumes.os, "geteuid", return_value=0):
            runner = Mock()
            for command in ["atlas-prune-volumes test app; docker volume prune -af", "atlas-prune-volumes prod", "docker volume prune"]:
                with self.assertRaises(ValueError):
                    prune_volumes.prune(command, runner, str(Path(directory) / "lock"))
            runner.assert_not_called()
            prune_volumes.prune("atlas-prune-volumes test app", runner, str(Path(directory) / "lock"))
            args = runner.call_args.args[0]
            self.assertEqual(args.count("--filter"), 1)
            self.assertEqual(args[-1], "label=io.constitution-atlas.deployment=test:app")

    def test_workflow_is_manual_with_opt_in_maintenance_and_no_test_workflow(self):
        # BaseLoader preserves YAML's 'on' key instead of treating it as a YAML 1.1 boolean.
        workflow = yaml.load((ROOT / ".github/workflows/deploy.yml").read_text(), Loader=yaml.BaseLoader)
        self.assertEqual(set(workflow["on"]), {"workflow_dispatch"})
        inputs = workflow["on"]["workflow_dispatch"]["inputs"]
        self.assertEqual(inputs["prune_volumes"]["default"], "false")
        self.assertEqual(inputs["prepopulate"]["default"], "false")
        self.assertEqual(set(workflow["jobs"]), {"authorize", "candidate-images", "deploy"})
        for job in workflow["jobs"].values():
            self.assertNotIn("uses", job)
        steps = workflow["jobs"]["deploy"]["steps"]
        populate = next(step for step in steps if step.get("run") == "npm run prepopulate")
        self.assertEqual(populate["if"], "inputs.prepopulate")


if __name__ == "__main__":
    unittest.main()
