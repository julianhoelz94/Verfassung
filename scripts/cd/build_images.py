#!/usr/bin/env python3
"""Compile release images on a native AMD64 runner without rerunning CI tests."""

import argparse
import json
import platform
import subprocess
from pathlib import Path

from release import PUBLIC_URLS, SHA, image_paths, validate_manifest, write_manifest


def command(*args, capture=False):
    return subprocess.run(args, check=True, text=True, capture_output=capture)


def build(root, repository, environment, source_sha, run_id):
    if platform.machine().lower() not in {"x86_64", "amd64"}:
        raise ValueError("Release images must be built on a native AMD64 runner")
    if environment not in PUBLIC_URLS or not SHA.fullmatch(source_sha):
        raise ValueError("Invalid environment or source revision")
    if not run_id.replace("-", "").isdigit():
        raise ValueError("Invalid workflow run identifier")
    paths = image_paths(root)
    images = {}
    for service, directory in paths.items():
        if (root / directory / "build.gradle.kts").is_file():
            command(str(root / "gradlew"), "--no-daemon", "-p", str(root / directory), "bootJar", "-x", "test")
        image_repository = f"ghcr.io/{repository.lower()}/{service}"
        tag = f"{image_repository}:sha-{source_sha}-{run_id}-{environment}"
        args = ["docker", "build", "--platform", "linux/amd64", "--tag", tag,
                "--label", f"org.opencontainers.image.source=https://github.com/{repository}",
                "--label", f"org.opencontainers.image.revision={source_sha}"]
        if service == "gateway-web":
            args += ["--build-arg", f"NEXT_PUBLIC_BASE_URL={PUBLIC_URLS[environment]}"]
        command(*args, str(root / directory))
        command("docker", "push", tag)
        result = command("docker", "image", "inspect", tag, "--format", "{{json .RepoDigests}}", capture=True)
        digests = [value for value in json.loads(result.stdout) if value.startswith(image_repository + "@sha256:")]
        if len(digests) != 1:
            raise ValueError(f"Could not resolve one registry digest for {service}")
        images[service] = digests[0]
    manifest = {"schema": 1, "source_sha": source_sha, "environment": environment,
                "public_url": PUBLIC_URLS[environment], "architecture": "amd64", "images": images}
    validate_manifest(manifest, root, repository, environment, source_sha)
    write_manifest(root / ".release", manifest)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repository", required=True)
    parser.add_argument("--environment", choices=PUBLIC_URLS, required=True)
    parser.add_argument("--source-sha", required=True)
    parser.add_argument("--run-id", required=True)
    args = parser.parse_args()
    build(Path.cwd(), args.repository, args.environment, args.source_sha, args.run_id)
