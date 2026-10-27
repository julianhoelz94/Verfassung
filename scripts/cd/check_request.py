#!/usr/bin/env python3
"""Authorize a manual deployment and pin a published release tag to its commit."""

import json
import os
import urllib.error
import urllib.parse
import urllib.request

from release import PUBLIC_URLS, SHA


def validate_request(event, ref, environment, tag):
    if event != "workflow_dispatch" or ref != "refs/heads/main":
        raise ValueError("Run the deployment workflow from main and select a release_tag input")
    if environment not in PUBLIC_URLS:
        raise ValueError("Select test or prod")
    if not tag or tag.startswith("refs/") or any(character.isspace() for character in tag):
        raise ValueError("Select a published release tag by its exact name")


def github_get(repository, path, token):
    request = urllib.request.Request(
        f"https://api.github.com/repos/{repository}/{path}",
        headers={"Authorization": f"Bearer {token}", "Accept": "application/vnd.github+json",
                 "X-GitHub-Api-Version": "2022-11-28"},
    )
    with urllib.request.urlopen(request, timeout=20) as response:
        return json.load(response)


def release_commit(repository, tag, token):
    encoded = urllib.parse.quote(tag, safe="")
    try:
        release = github_get(repository, f"releases/tags/{encoded}", token)
        if (release.get("tag_name") != tag or release.get("draft") is not False
                or not release.get("published_at")):
            raise ValueError("The selected tag must have a published GitHub release")
        reference = github_get(repository, f"git/ref/tags/{encoded}", token)
        if reference.get("ref") != f"refs/tags/{tag}":
            raise ValueError("The selected release must refer to an exact tag")
        target = reference["object"]
        # Lightweight tags point directly to commits; annotated tags can nest.
        for _ in range(16):
            sha = target.get("sha", "")
            if not SHA.fullmatch(sha):
                raise ValueError("Invalid release tag object SHA")
            if target.get("type") == "commit":
                return sha
            if target.get("type") != "tag":
                raise ValueError("The release tag must point to a commit")
            target = github_get(repository, f"git/tags/{sha}", token)["object"]
        raise ValueError("Too many nested release tag objects")
    except urllib.error.HTTPError as error:
        if error.code == 404:
            raise ValueError("Select an existing tag with a published GitHub release; branches and commit hashes are not deployment targets") from error
        raise


def require_admin(repository, actor, token):
    owner = repository.split("/")[0]
    if actor.lower() == owner.lower():
        return
    permission = github_get(repository, f"collaborators/{urllib.parse.quote(actor, safe='')}/permission", token).get("permission")
    if permission != "admin":
        raise PermissionError("Only repository administrators may deploy")


def main():
    environment = os.environ["DEPLOYMENT_ENVIRONMENT"]
    tag = os.environ.get("RELEASE_TAG", "")
    validate_request(os.environ["GITHUB_EVENT_NAME"], os.environ["GITHUB_REF"], environment, tag)
    for actor in {os.environ["GITHUB_ACTOR"], os.environ["GITHUB_TRIGGERING_ACTOR"]}:
        require_admin(os.environ["GITHUB_REPOSITORY"], actor, os.environ["GH_TOKEN"])
    sha = release_commit(os.environ["GITHUB_REPOSITORY"], tag, os.environ["GH_TOKEN"])
    with open(os.environ["GITHUB_OUTPUT"], "a") as output:
        output.write(f"source-sha={sha}\n")
    print(f"Approved release {tag} ({sha}) for {environment}: {PUBLIC_URLS[environment]}")


if __name__ == "__main__":
    main()
