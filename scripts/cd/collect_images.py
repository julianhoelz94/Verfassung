#!/usr/bin/env python3
"""Assemble a release only after every matrix image has published a valid digest."""

import argparse
import json
from pathlib import Path

from release import PUBLIC_URLS, image_paths, validate_image_fragment, validate_manifest, write_manifest


def collect(root, directory, repository, environment, source_sha, run_id):
    root = Path(root)
    directory = Path(directory)
    images = {}
    attempts = {}
    for path in sorted(directory.rglob("*")):
        if not path.is_file():
            continue
        fragment = validate_image_fragment(json.loads(path.read_text()), root, repository,
                                           environment, source_sha, run_id)
        service = fragment["service"]
        expected = Path("candidate-image-" + service) / "image.json"
        if path.relative_to(directory) != expected:
            raise ValueError("Image artifact name does not match its service")
        if service in images:
            raise ValueError(f"Duplicate image fragment for {service}")
        images[service] = fragment["image"]
        attempts[service] = fragment["run_attempt"]
    if set(images) != set(image_paths(root)):
        raise ValueError("Image artifacts do not contain exactly the application images")
    # A failed-job rerun may retain successful fragments from an earlier attempt
    # of this same workflow run. Every fragment still pins the same source/target.
    manifest = {"schema": 1, "source_sha": source_sha, "environment": environment,
                "public_url": PUBLIC_URLS[environment], "architecture": "amd64", "images": images,
                "run_id": run_id, "image_build_attempts": attempts}
    validate_manifest(manifest, root, repository, environment, source_sha)
    write_manifest(root / ".release", manifest)
    return manifest


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--directory", default=".image-artifacts")
    parser.add_argument("--repository", required=True)
    parser.add_argument("--environment", choices=PUBLIC_URLS, required=True)
    parser.add_argument("--source-sha", required=True)
    parser.add_argument("--run-id", required=True)
    args = parser.parse_args()
    collect(Path.cwd(), args.directory, args.repository, args.environment, args.source_sha, args.run_id)
