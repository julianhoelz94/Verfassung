#!/usr/bin/env python3
"""Compile one release image on a native AMD64 runner without rerunning CI tests."""

import argparse
import json
import platform
import subprocess
from pathlib import Path

from release import PUBLIC_URLS, RUN_NUMBER, SHA, image_paths, validate_image_fragment


def command(*args, capture=False):
    return subprocess.run(args, check=True, text=True, capture_output=capture)


def build(root, repository, environment, source_sha, run_id, run_attempt, service):
    root = Path(root)
    if platform.machine().lower() not in {"x86_64", "amd64"}:
        raise ValueError("Release images must be built on a native AMD64 runner")
    if environment not in PUBLIC_URLS or not SHA.fullmatch(source_sha):
        raise ValueError("Invalid environment or source revision")
    if not RUN_NUMBER.fullmatch(run_id) or not RUN_NUMBER.fullmatch(run_attempt):
        raise ValueError("Invalid workflow run identifier or attempt")
    paths = image_paths(root)
    if service not in paths:
        raise ValueError("Unknown release image")
    directory = paths[service]
    if (root / directory / "build.gradle.kts").is_file():
        command(str(root / "gradlew"), "--no-daemon", "-p", str(root / directory), "bootJar", "-x", "test")
    image_repository = f"ghcr.io/{repository.lower()}/{service}"
    tag = f"{image_repository}:sha-{source_sha}-{run_id}-{run_attempt}-{environment}"
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
    fragment = {"schema": 1, "repository": repository.lower(), "source_sha": source_sha,
                "environment": environment, "public_url": PUBLIC_URLS[environment], "architecture": "amd64",
                "run_id": run_id, "run_attempt": run_attempt, "service": service, "image": digests[0]}
    validate_image_fragment(fragment, root, repository, environment, source_sha, run_id)
    output = root / ".image" / "image.json"
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(fragment, indent=2) + "\n")
    return fragment


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repository", required=True)
    parser.add_argument("--environment", choices=PUBLIC_URLS, required=True)
    parser.add_argument("--source-sha", required=True)
    parser.add_argument("--run-id", required=True)
    parser.add_argument("--run-attempt", required=True)
    parser.add_argument("--service", required=True)
    args = parser.parse_args()
    build(Path.cwd(), args.repository, args.environment, args.source_sha, args.run_id, args.run_attempt, args.service)
