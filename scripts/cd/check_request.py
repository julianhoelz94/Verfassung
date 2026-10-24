#!/usr/bin/env python3
"""Require a main-branch, administrator-triggered manual deployment."""

import json
import os
import urllib.parse
import urllib.request

from release import PUBLIC_URLS


def validate_request(event, ref, environment, prune, confirmation):
    if event != "workflow_dispatch" or ref != "refs/heads/main":
        raise ValueError("Deployments must be manually dispatched from main")
    if environment not in PUBLIC_URLS:
        raise ValueError("Select test or prod")
    if prune and confirmation != "PRUNE " + environment:
        raise ValueError(f"To prune unused volumes, type PRUNE {environment} in the confirmation field")


def require_admin(repository, actor, token):
    owner = repository.split("/")[0]
    if actor.lower() == owner.lower():
        return
    request = urllib.request.Request(
        f"https://api.github.com/repos/{repository}/collaborators/{urllib.parse.quote(actor, safe='')}/permission",
        headers={"Authorization": f"Bearer {token}", "Accept": "application/vnd.github+json",
                 "X-GitHub-Api-Version": "2022-11-28"},
    )
    with urllib.request.urlopen(request, timeout=20) as response:
        permission = json.load(response).get("permission")
    if permission != "admin":
        raise PermissionError("Only repository administrators may deploy")


if __name__ == "__main__":
    environment = os.environ["DEPLOYMENT_ENVIRONMENT"]
    validate_request(os.environ["GITHUB_EVENT_NAME"], os.environ["GITHUB_REF"], environment,
                     os.environ.get("PRUNE_VOLUMES") == "true", os.environ.get("PRUNE_CONFIRMATION", ""))
    for actor in {os.environ["GITHUB_ACTOR"], os.environ["GITHUB_TRIGGERING_ACTOR"]}:
        require_admin(os.environ["GITHUB_REPOSITORY"], actor, os.environ["GH_TOKEN"])
    print(f"Approved manual request for {environment}: {PUBLIC_URLS[environment]}")
