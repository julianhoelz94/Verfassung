"""Shared, strict release metadata used by the manual deployment workflow."""

import json
import re
from pathlib import Path

PUBLIC_URLS = {
    "test": "https://tst.verfassungen.julianhoelz.de",
    "prod": "https://verfassungen.julianhoelz.de",
}
UUID = re.compile(r"[A-Za-z0-9][A-Za-z0-9_-]{0,63}\Z")
SHA = re.compile(r"[a-f0-9]{40}\Z")


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
        pattern = rf"ghcr\.io/{re.escape(repository.lower())}/{re.escape(service)}@sha256:[a-f0-9]{{64}}"
        if not isinstance(image, str) or not re.fullmatch(pattern, image):
            raise ValueError(f"Invalid immutable image reference for {service}")
    return manifest


def write_manifest(directory, manifest):
    directory = Path(directory)
    directory.mkdir(parents=True, exist_ok=True)
    (directory / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
    override = {"services": {name: {"image": image} for name, image in manifest["images"].items()}}
    (directory / "release-images.compose.json").write_text(json.dumps(override, indent=2) + "\n")
