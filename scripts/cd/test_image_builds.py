import copy
import json
import subprocess
import tempfile
import unittest
from pathlib import Path
from unittest.mock import Mock, patch

import yaml

import build_images
import collect_images
import release


ROOT = Path(__file__).resolve().parents[2]
REPOSITORY = "julianhoelz94/Verfassung"
SHA = "a" * 40
RUN_ID = "12345"


def fragment(service, attempt="1"):
    return {"schema": 1, "repository": REPOSITORY.lower(), "source_sha": SHA,
            "environment": "test", "public_url": release.PUBLIC_URLS["test"], "architecture": "amd64",
            "run_id": RUN_ID, "run_attempt": attempt, "service": service,
            "image": f"ghcr.io/{REPOSITORY.lower()}/{service}@sha256:{'b' * 64}"}


def artifacts(directory):
    paths = {}
    for service in release.image_paths(ROOT):
        path = directory / ("candidate-image-" + service) / "image.json"
        path.parent.mkdir()
        path.write_text(json.dumps(fragment(service)))
        paths[service] = path
    return paths


class ImageBuildTests(unittest.TestCase):
    def test_matrix_discovers_each_package_and_only_kotlin_needs_gradle(self):
        matrix = release.image_matrix(ROOT)["include"]
        self.assertEqual({row["service"] for row in matrix}, set(release.image_paths(ROOT)))
        self.assertEqual(len(matrix), 12)
        self.assertEqual(sum(row["gradle"] for row in matrix), 9)

    def test_builds_only_selected_native_image_and_never_runs_tests(self):
        for service in ("identity-service", "gateway-web"):
            with self.subTest(service=service), tempfile.TemporaryDirectory() as directory:
                root = Path(directory)
                kotlin = root / "services/identity-service"
                kotlin.mkdir(parents=True)
                (kotlin / "Dockerfile").touch()
                (kotlin / "build.gradle.kts").touch()
                def command(*args, **kwargs):
                    if args[:3] == ("docker", "image", "inspect"):
                        return Mock(stdout=json.dumps([args[3].split(":")[0] + "@sha256:" + "b" * 64]))
                    return Mock()
                with patch.object(build_images.platform, "machine", return_value="x86_64"), \
                        patch.object(build_images, "command", side_effect=command) as run:
                    result = build_images.build(root, REPOSITORY, "test", SHA, RUN_ID, "2", service)
                calls = [call.args for call in run.call_args_list]
                gradle = [call for call in calls if call[0].endswith("gradlew")]
                self.assertEqual(len(gradle), 1 if service == "identity-service" else 0)
                if gradle:
                    self.assertEqual(gradle[0][-3:], ("bootJar", "-x", "test"))
                docker = [call for call in calls if call[:2] == ("docker", "build")]
                self.assertEqual(len(docker), 1)
                self.assertEqual(docker[0][2:4], ("--platform", "linux/amd64"))
                if service == "gateway-web":
                    self.assertIn("NEXT_PUBLIC_BASE_URL=" + release.PUBLIC_URLS["test"], docker[0])
                self.assertEqual(result, fragment(service, attempt="2"))
                self.assertEqual(json.loads((root / ".image/image.json").read_text()), result)

    def test_invalid_target_or_failed_push_produces_no_image_artifact(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "services").mkdir()
            with patch.object(build_images.platform, "machine", return_value="arm64"), \
                    patch.object(build_images, "command") as run:
                with self.assertRaises(ValueError):
                    build_images.build(root, REPOSITORY, "test", SHA, RUN_ID, "1", "gateway-web")
                run.assert_not_called()
            with patch.object(build_images.platform, "machine", return_value="x86_64"), \
                    patch.object(build_images, "command", side_effect=[Mock(), subprocess.CalledProcessError(1, "docker push")]):
                with self.assertRaises(subprocess.CalledProcessError):
                    build_images.build(root, REPOSITORY, "test", SHA, RUN_ID, "1", "gateway-web")
            self.assertFalse((root / ".image/image.json").exists())


class ImageCollectionTests(unittest.TestCase):
    def test_complete_same_run_artifacts_support_failed_job_reruns(self):
        with tempfile.TemporaryDirectory() as directory:
            paths = artifacts(Path(directory))
            paths["gateway-web"].write_text(json.dumps(fragment("gateway-web", attempt="2")))
            with patch.object(collect_images, "write_manifest") as write:
                result = collect_images.collect(ROOT, directory, REPOSITORY, "test", SHA, RUN_ID)
            release.validate_manifest(result, ROOT, REPOSITORY, "test", SHA)
            self.assertEqual(len(result["images"]), 12)
            self.assertEqual(result["image_build_attempts"]["gateway-web"], "2")
            self.assertEqual(result["image_build_attempts"]["identity-service"], "1")
            write.assert_called_once_with(ROOT / ".release", result)

    def test_missing_duplicate_or_misnamed_artifact_blocks_release(self):
        for alteration in ("missing", "duplicate", "misnamed"):
            with self.subTest(alteration=alteration), tempfile.TemporaryDirectory() as directory:
                paths = artifacts(Path(directory))
                path = paths["gateway-web"]
                if alteration == "missing":
                    path.unlink()
                elif alteration == "duplicate":
                    (path.parent / "second.json").write_text(path.read_text())
                else:
                    path.rename(path.parent / "renamed.json")
                with patch.object(collect_images, "write_manifest") as write:
                    with self.assertRaises(ValueError):
                        collect_images.collect(ROOT, directory, REPOSITORY, "test", SHA, RUN_ID)
                    write.assert_not_called()

    def test_wrong_source_environment_run_architecture_or_image_blocks_release(self):
        alterations = [("source_sha", "c" * 40), ("environment", "prod"), ("run_id", "99999"),
                       ("repository", "other/repo"), ("architecture", "arm64"),
                       ("public_url", release.PUBLIC_URLS["prod"]), ("service", "backup-service"),
                       ("image", "ghcr.io/julianhoelz94/verfassung/gateway-web:latest"),
                       ("image", "ghcr.io/julianhoelz94/verfassung/identity-service@sha256:" + "b" * 64),
                       ("run_attempt", "0")]
        for key, value in alterations:
            with self.subTest(key=key, value=value), tempfile.TemporaryDirectory() as directory:
                paths = artifacts(Path(directory))
                bad = copy.deepcopy(fragment("gateway-web"))
                bad[key] = value
                paths["gateway-web"].write_text(json.dumps(bad))
                with patch.object(collect_images, "write_manifest") as write:
                    with self.assertRaises(ValueError):
                        collect_images.collect(ROOT, directory, REPOSITORY, "test", SHA, RUN_ID)
                    write.assert_not_called()

    def test_workflow_bounds_parallelism_and_requires_all_images_before_deploy(self):
        workflow = yaml.load((ROOT / ".github/workflows/deploy.yml").read_text(), Loader=yaml.BaseLoader)
        jobs = workflow["jobs"]
        build = jobs["build-image"]
        self.assertEqual(build["strategy"]["max-parallel"], "6")
        self.assertEqual(build["strategy"]["fail-fast"], "false")
        self.assertEqual(build["runs-on"], "ubuntu-24.04")
        self.assertEqual(build["strategy"]["matrix"], "${{ fromJSON(needs.authorize.outputs.image-matrix) }}")
        self.assertEqual(set(jobs["candidate-images"]["needs"]), {"authorize", "build-image"})
        self.assertIn("candidate-images", jobs["deploy"]["needs"])
        self.assertNotIn("if", jobs["candidate-images"])
        self.assertNotIn("continue-on-error", build)
        for job in (build, jobs["candidate-images"]):
            uploads = [step for step in job["steps"] if step.get("uses", "").startswith("actions/upload-artifact@")]
            self.assertEqual(len(uploads), 1)
            self.assertEqual(uploads[0]["with"]["overwrite"], "true")
        downloads = [step for step in jobs["candidate-images"]["steps"] if step.get("uses", "").startswith("actions/download-artifact@")]
        self.assertEqual(downloads[0]["with"]["pattern"], "candidate-image-*")
        self.assertEqual(downloads[0]["with"]["merge-multiple"], "false")


if __name__ == "__main__":
    unittest.main()
