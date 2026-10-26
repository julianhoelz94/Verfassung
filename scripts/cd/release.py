"""Shared, strict release metadata used by the manual deployment workflow."""

import argparse
import json
import re
from pathlib import Path

PUBLIC_URLS = {
    "test": "https://tst.verfassungen.julianhoelz.de",
    "prod": "https://verfassungen.julianhoelz.de",
}
UUID = re.compile(r"[A-Za-z0-9][A-Za-z0-9_-]{0,63}\Z")
SHA = re.compile(r"[a-f0-9]{40}\Z")
RUN_NUMBER = re.compile(r"[1-9][0-9]*\Z")


def image_paths(root):
    root = Path(root)
    paths = {
        directory.name: directory.relative_to(root).as_posix()
        for directory in sorted((root / "services").iterdir())
        if (directory / "build.gradle.kts").is_file()
        and (directory / "Dockerfile").is_file()
    }
    paths.update({
        "gateway-web": "apps/gateway-web",
        "mcp-server": "services/mcp-server",
        "edge-proxy": "infra/caddy",
    })
    return paths


def image_variable(service):
    return "ATLAS_IMAGE_" + service.upper().replace("-", "_")


def image_matrix(root):
    root = Path(root)
    return {"include": [{"service": service, "gradle": (root / directory / "build.gradle.kts").is_file()}
                        for service, directory in image_paths(root).items()]}


def validate_image_reference(image, repository, service):
    pattern = rf"ghcr\.io/{re.escape(repository.lower())}/{re.escape(service)}@sha256:[a-f0-9]{{64}}"
    if not isinstance(image, str) or not re.fullmatch(pattern, image):
        raise ValueError(f"Invalid immutable image reference for {service}")


def validate_image_fragment(fragment, root, repository, environment, source_sha, run_id):
    if (environment not in PUBLIC_URLS or not SHA.fullmatch(source_sha)
            or not RUN_NUMBER.fullmatch(run_id)):
        raise ValueError("Invalid release target or workflow run identifier")
    expected = {"schema": 1, "repository": repository.lower(), "environment": environment,
                "source_sha": source_sha, "public_url": PUBLIC_URLS[environment],
                "architecture": "amd64", "run_id": run_id}
    if not isinstance(fragment, dict):
        raise ValueError("Image fragment must be an object")
    for key, value in expected.items():
        if fragment.get(key) != value:
            raise ValueError(f"Image fragment has an unexpected {key}")
    service = fragment.get("service")
    if not isinstance(service, str) or service not in image_paths(root):
        raise ValueError("Image fragment has an unexpected service")
    attempt = fragment.get("run_attempt")
    if not isinstance(attempt, str) or not RUN_NUMBER.fullmatch(attempt):
        raise ValueError("Image fragment has an invalid run attempt")
    validate_image_reference(fragment.get("image"), repository, service)
    return fragment


def validate_manifest(manifest, root, repository, environment, source_sha):
    if environment not in PUBLIC_URLS or not SHA.fullmatch(source_sha):
        raise ValueError("Invalid deployment environment or source revision")
    expected = {
        "schema": 1,
        "environment": environment,
        "source_sha": source_sha,
        "architecture": "amd64",
        "public_url": PUBLIC_URLS[environment],
    }
    for key, value in expected.items():
        if manifest.get(key) != value:
            raise ValueError(f"Release manifest has an unexpected {key}")
    images = manifest.get("images")
    if not isinstance(images, dict) or set(images) != set(image_paths(root)):
        raise ValueError("Release manifest does not contain exactly the application images")
    for service, image in images.items():
        validate_image_reference(image, repository, service)
    return manifest


def write_manifest(directory, manifest):
    directory = Path(directory)
    directory.mkdir(parents=True, exist_ok=True)
    (directory / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
    override = {"services": {name: {"image": image} for name, image in manifest["images"].items()}}
    (directory / "release-images.compose.json").write_text(json.dumps(override, indent=2) + "\n")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--matrix", action="store_true", required=True)
    parser.parse_args()
    print(json.dumps(image_matrix(Path.cwd()), separators=(",", ":")))
