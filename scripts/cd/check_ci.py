#!/usr/bin/env python3
"""Check compilation jobs in existing CI for this commit; never dispatch tests."""

import json
import os
import urllib.parse
import urllib.request
from pathlib import Path

from release import SHA, image_paths


def github_get(path):
    request = urllib.request.Request(
        "https://api.github.com" + path,
        headers={"Authorization": "Bearer " + os.environ["GH_TOKEN"],
                 "Accept": "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28"},
    )
    with urllib.request.urlopen(request, timeout=30) as response:
        return json.load(response)


def check(repository, source_sha, root, get=github_get):
    if not SHA.fullmatch(source_sha):
        raise ValueError("Invalid source revision")
    prefix = f"/repos/{repository}/actions"
    query = urllib.parse.urlencode({"head_sha": source_sha, "branch": "main", "event": "push", "per_page": 100})
    runs = get(prefix + "/workflows/ci.yml/runs?" + query)["workflow_runs"]
    runs = [run for run in runs if run["head_sha"] == source_sha
            and run["head_branch"] == "main" and run["event"] == "push"]
    if not runs:
        raise ValueError("No main-branch CI run exists for this exact commit. Run CI before deploying.")
    run = max(runs, key=lambda item: item["id"])
    jobs = []
    for page in range(1, 101):
        batch = get(prefix + f"/runs/{run['id']}/jobs?filter=latest&per_page=100&page={page}")["jobs"]
        jobs.extend(batch)
        if len(batch) < 100:
            break
    else:
        raise ValueError("Too many CI jobs; cannot confirm compilation")
    required = {"frontend", "mcp-server", "gateway-image", "full-stack-service-artifacts"}
    required.update(f"images ({name})" for name, directory in image_paths(root).items()
                    if (root / directory / "build.gradle.kts").is_file())
    for name in sorted(required):
        matches = [job for job in jobs if job["name"] == name]
        if len(matches) != 1 or matches[0].get("status") != "completed" or matches[0].get("conclusion") != "success":
            raise ValueError(f"CI compilation job {name!r} has not succeeded for this commit. Check CI run {run['id']}.")
    print(f"Existing CI compilation passed: https://github.com/{repository}/actions/runs/{run['id']}")
    return run["id"]


if __name__ == "__main__":
    check(os.environ["GITHUB_REPOSITORY"], os.environ["GITHUB_SHA"], Path.cwd())
