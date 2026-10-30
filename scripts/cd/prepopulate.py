#!/usr/bin/env python3
"""Validate fixture credentials and locate a trusted deployment seed journal."""

import argparse
import os
import urllib.error
import urllib.parse

from check_request import github_get, release_commit
from release import PUBLIC_URLS, RUN_NUMBER, SHA, validate_release_tag

PROFILES = {"compact", "extended", "scale"}


def validate_credentials(env):
    if env.get("PREPOPULATE", "false") == "false":
        return
    if env.get("PREPOPULATE") != "true":
        raise ValueError("PREPOPULATE must be true or false")
    profile = env.get("PREPOPULATE_PROFILE", "compact")
    if profile not in PROFILES:
        raise ValueError("Select compact, extended or scale as the fixture profile")
    roles = ["ADMIN", "REVIEWER", "PUBLISHER"]
    required = ["PREPOPULATE_TOTP_SECRET", "PREPOPULATE_PUBLISHER_TOTP_SECRET"]
    if profile != "compact":
        roles += ["EDITOR", "VIEWER"]
        required += ["PREPOPULATE_EDITOR_TOTP_SECRET"]
    required += [f"PREPOPULATE_{role}_{field}" for role in roles for field in ("EMAIL", "PASSWORD")]
    missing = [key for key in required if not env.get(key, "").strip()]
    if missing:
        raise ValueError("Missing environment secrets: " + ", ".join(missing))
    emails = [env[f"PREPOPULATE_{role}_EMAIL"].strip().lower() for role in roles]
    if len(set(emails)) != len(emails):
        raise ValueError("Use separate fixture accounts for " + ", ".join(roles))


def find_state(repository, environment, token, get=None, resolve=None):
    if environment not in PUBLIC_URLS:
        raise ValueError("Select test or prod")
    get = get or github_get
    resolve = resolve or release_commit
    workflow_id = get(repository, "actions/workflows/deploy.yml", token)["id"]
    name = "prepopulate-state-" + environment
    artifacts = []
    for page in range(1, 101):
        response = get(repository, "actions/artifacts?" + urllib.parse.urlencode(
            {"name": name, "per_page": 100, "page": page}), token)
        batch = response["artifacts"]
        artifacts += [item for item in batch if item.get("name") == name]
        if len(batch) < 100:
            break
    else:
        raise ValueError("Fixture-state artifact pagination exceeded its limit")
    # Rerunning an older deployment can create the newest checkpoint. Run IDs
    # and artifact IDs alone do not identify the latest saved state.
    for artifact in sorted(artifacts, key=lambda item: item["created_at"], reverse=True):
        provenance = artifact.get("workflow_run") or {}
        run_id = str(provenance.get("id", ""))
        if not RUN_NUMBER.fullmatch(run_id):
            continue
        run = get(repository, f"actions/runs/{run_id}", token)
        if (run.get("workflow_id") != workflow_id or run.get("event") != "workflow_dispatch"
                or (run.get("head_repository") or {}).get("full_name", "").lower() != repository.lower()):
            continue
        try:
            tag = validate_release_tag(run.get("head_branch"))
            sha = resolve(repository, tag, token)
        except ValueError:
            continue
        except urllib.error.HTTPError as error:
            if error.code == 404:
                continue
            raise
        if (not isinstance(run.get("head_sha"), str) or not SHA.fullmatch(run["head_sha"]) or run["head_sha"] != sha
                or provenance.get("head_sha") != sha):
            continue
        if artifact.get("expired") is not False:
            raise ValueError("The latest deployment fixture journal has expired; restore its saved backup before prepopulation")
        artifact_id = str(artifact.get("id", ""))
        if not RUN_NUMBER.fullmatch(artifact_id):
            raise ValueError("Invalid fixture-state artifact ID")
        return {"run-id": run_id, "artifact-id": artifact_id}
    return None


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--find-state", action="store_true")
    args = parser.parse_args()
    if not args.find_state:
        validate_credentials(os.environ)
        return
    state = find_state(os.environ["GITHUB_REPOSITORY"], os.environ["DEPLOYMENT_ENVIRONMENT"], os.environ["GH_TOKEN"])
    with open(os.environ["GITHUB_OUTPUT"], "a") as output:
        output.write("state-found=" + ("true" if state else "false") + "\n")
        for key, value in (state or {}).items():
            output.write(f"{key}={value}\n")
    print("Restore the previous deployment fixture journal." if state else "No saved deployment fixture journal found; existing exploration fixtures require their saved journal.")


if __name__ == "__main__":
    main()
