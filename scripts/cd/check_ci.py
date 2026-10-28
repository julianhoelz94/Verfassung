#!/usr/bin/env python3
"""Wait for existing CI compilation for this commit; never dispatch tests."""

import argparse
import json
import os
import time
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


def matches_commit(run, source_sha):
    return (run.get("head_sha") == source_sha and run.get("head_branch") == "main"
            and run.get("event") == "push")


def compilation_jobs(repository, run, required, get):
    jobs = []
    for page in range(1, 101):
        # A partial rerun can omit already successful jobs from filter=latest.
        # Select each compilation job's newest attempt from the complete history.
        batch = get(f"/repos/{repository}/actions/runs/{run['id']}/jobs?filter=all&per_page=100&page={page}")["jobs"]
        jobs.extend(batch)
        if len(batch) < 100:
            break
    else:
        raise ValueError("Too many CI jobs; cannot confirm compilation")
    selected = {}
    for name in sorted(required):
        matches = [job for job in jobs if job.get("name") == name]
        if matches:
            attempt = max(job["run_attempt"] for job in matches)
            latest = [job for job in matches if job["run_attempt"] == attempt]
            if len(latest) != 1:
                raise ValueError(f"Multiple CI compilation jobs named {name!r} in attempt {attempt}")
            selected[name] = latest[0]
    return selected


def check(repository, source_sha, root, get=github_get, timeout=2700, poll_interval=30,
          sleep=time.sleep, now=time.monotonic):
    if not SHA.fullmatch(source_sha):
        raise ValueError("Invalid source revision")
    if timeout <= 0 or poll_interval <= 0:
        raise ValueError("CI timeout and polling interval must be positive")
    prefix = f"/repos/{repository}/actions"
    query = urllib.parse.urlencode({"head_sha": source_sha, "branch": "main", "event": "push", "per_page": 100})
    required = {"backend-services", "frontend", "mcp-server", "gateway-image", "full-stack-service-artifacts"}
    required.update(f"images ({name})" for name, directory in image_paths(root).items()
                    if (root / directory / "build.gradle.kts").is_file())
    deadline = now() + timeout
    previous_message = None
    message = f"Waiting for main CI to appear for {source_sha}"
    while now() < deadline:
        runs = get(prefix + "/workflows/ci.yml/runs?" + query)["workflow_runs"]
        runs = [run for run in runs if matches_commit(run, source_sha)]
        if not runs:
            message = f"Waiting for main CI to appear for {source_sha}"
        else:
            run = max(runs, key=lambda item: item["id"])
            link = f"https://github.com/{repository}/actions/runs/{run['id']}"
            if run["status"] in {"queued", "requested", "waiting", "pending"}:
                # In a queued rerun, the jobs API can still show the old attempt.
                message = f"Waiting for CI run {run['id']} to start ({run['status']}): {link}"
            else:
                jobs = compilation_jobs(repository, run, required, get)
                current = get(prefix + f"/runs/{run['id']}")
                if not matches_commit(current, source_sha):
                    raise ValueError("CI run no longer matches the requested main commit")
                if (current["run_attempt"] != run["run_attempt"]
                        or current["status"] in {"queued", "requested", "waiting", "pending"}):
                    message = f"CI run {run['id']} was restarted; waiting for its current attempt: {link}"
                else:
                    waiting = []
                    discovery = jobs.get("backend-services")
                    for name in sorted(required):
                        job = jobs.get(name)
                        if job is None:
                            waiting.append(name)
                        elif job["head_sha"] != source_sha:
                            raise ValueError(f"CI compilation job {name!r} belongs to a different commit: {link}")
                        elif (name.startswith("images (") and discovery is not None
                              and job["run_attempt"] < discovery["run_attempt"]):
                            # A new discovery run recreates the image matrix. Old
                            # successes cannot stand in for not-yet-created jobs.
                            waiting.append(name)
                        elif job["status"] == "completed":
                            if (job.get("conclusion") != "success" and job["run_attempt"] < current["run_attempt"]
                                    and current["status"] != "completed"):
                                # The replacement for a failed job may not have
                                # appeared yet at the beginning of a rerun.
                                waiting.append(name)
                            elif job.get("conclusion") != "success":
                                raise ValueError(f"CI compilation job {name!r} ended with {job.get('conclusion')!r}: {link}")
                        else:
                            waiting.append(name)
                    if not waiting:
                        # Other CI jobs, including E2E, do not gate deployment.
                        print(f"Existing CI compilation passed: {link}", flush=True)
                        return run["id"]
                    if run["status"] == current["status"] == "completed":
                        raise ValueError(f"CI finished without successful compilation checks: {', '.join(waiting)}. {link}")
                    message = f"Waiting for CI compilation: {', '.join(waiting)}. {link}"
        if message != previous_message:
            print(message, flush=True)
            previous_message = message
        remaining = deadline - now()
        if remaining > 0:
            sleep(min(poll_interval, remaining))
    raise TimeoutError(f"Timed out after {timeout}s waiting for CI compilation for {source_sha}. {message}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source-sha", required=True)
    parser.add_argument("--timeout-seconds", type=int, default=2700)
    parser.add_argument("--poll-seconds", type=int, default=30)
    args = parser.parse_args()
    try:
        check(os.environ["GITHUB_REPOSITORY"], args.source_sha, Path.cwd(),
              timeout=args.timeout_seconds, poll_interval=args.poll_seconds)
    except (ValueError, TimeoutError) as error:
        print(f"::error::{error}", flush=True)
        raise SystemExit(1)
