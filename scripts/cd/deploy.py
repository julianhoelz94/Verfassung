#!/usr/bin/env python3
"""Select one compiled release in Coolify and await its deployment result."""

import argparse
import ipaddress
import json
import os
import re
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

from release import PUBLIC_URLS, UUID, image_variable, validate_manifest


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def private_coolify_url(value):
    parsed = urllib.parse.urlsplit(value)
    host = parsed.hostname or ""
    try:
        address = ipaddress.ip_address(host)
        trusted = address in ipaddress.ip_network("100.64.0.0/10") if address.version == 4 else address in ipaddress.ip_network("fd7a:115c:a1e0::/48")
    except ValueError:
        trusted = host == "coolify" or host.endswith(".ts.net")
    if (parsed.scheme not in {"http", "https"} or not trusted or parsed.username
            or parsed.password or parsed.query or parsed.fragment or parsed.path not in {"", "/"}):
        raise ValueError("COOLIFY_URL must be a private Tailscale origin without an API path")
    # Accessing port also validates malformed port values.
    parsed.port
    return value.rstrip("/")


def identifier(value, name):
    if not UUID.fullmatch(value):
        raise ValueError(f"Invalid {name}")
    return value


def required(name):
    value = os.environ.get(name, "").strip()
    if not value:
        raise ValueError(f"Missing required setting: {name}")
    return value


class Api:
    def __init__(self, origin, config_token, deploy_token):
        self.origin = private_coolify_url(origin)
        self.config_token = config_token
        self.deploy_token = deploy_token
        self.opener = urllib.request.build_opener(NoRedirect())

    def request(self, method, path, payload=None, deploy=False):
        token = self.deploy_token if deploy else self.config_token
        request = urllib.request.Request(
            self.origin + "/api/v1" + path,
            data=json.dumps(payload).encode() if payload is not None else None,
            headers={"Authorization": f"Bearer {token}", "Accept": "application/json", "Content-Type": "application/json"},
            method=method,
        )
        try:
            with self.opener.open(request, timeout=30) as response:
                return json.load(response)
        except urllib.error.HTTPError as error:
            # Responses/logs can contain credentials. Report the route/status only.
            raise RuntimeError(f"Coolify {method} {path} returned HTTP {error.code}") from None


def canonical_domain(value):
    parsed = urllib.parse.urlsplit(value)
    if parsed.scheme != "https" or parsed.username or parsed.password or parsed.path not in {"", "/"} or parsed.query or parsed.fragment:
        return None
    if parsed.port not in {None, 80, 443}:
        return None
    return "https://" + (parsed.hostname or "")


def validate_application(api, project, application, environment, repository):
    result = api.request("GET", f"/projects/{project}/{environment}")
    applications = result.get("applications", []) if isinstance(result, dict) else []
    if not any(isinstance(item, dict) and item.get("uuid") == application for item in applications):
        raise ValueError("COOLIFY_APP_UUID does not belong to the selected project environment")
    app = api.request("GET", f"/applications/{application}")
    expected_repository = f"https://github.com/{repository}".lower()
    actual_repository = re.sub(r"\.git$", "", str(app.get("git_repository", "")).rstrip("/")).lower()
    if app.get("build_pack") != "dockercompose" or actual_repository != expected_repository:
        raise ValueError("Configure a Git-based Docker Compose application for this repository first")
    domains = app.get("docker_compose_domains") or {}
    if isinstance(domains, str):
        domains = json.loads(domains)
    if isinstance(domains, list):
        domains = {item.get("name"): item for item in domains if isinstance(item, dict)}
    if isinstance(domains, dict) and any(
        name != "edge-proxy" and isinstance(entry, dict) and entry.get("domain")
        for name, entry in domains.items()
    ):
        raise ValueError("Only edge-proxy may have a public domain in this application")
    edge = domains.get("edge-proxy", {}) if isinstance(domains, dict) else {}
    domain_values = str(edge.get("domain", "")).split(",") if isinstance(edge, dict) else []
    origins = {canonical_domain(value.strip()) for value in domain_values}
    if origins != {PUBLIC_URLS[environment]}:
        raise ValueError(f"Assign only {PUBLIC_URLS[environment]} to edge-proxy in this Coolify application")
    return app


def env_payload(manifest):
    values = {image_variable(service): image for service, image in manifest["images"].items()}
    values.update({
        "PUBLIC_BASE_URL": manifest["public_url"],
        "NEXT_PUBLIC_BASE_URL": manifest["public_url"],
        "PROFILE": "production", "TLS_MODE": "external-proxy",
        "SESSION_COOKIE_SECURE": "true", "IDENTITY_SEED_MODE": "off",
        "CADDY_EXPOSE_API_DOCS": "false",
    })
    return {"data": [{"key": key, "value": value, "is_preview": False,
                      "is_buildtime": False, "is_runtime": True, "is_literal": True}
                     for key, value in values.items()]}


def wait_for_deployment(api, deployment, source_sha, timeout=1800, sleep=time.sleep, now=time.monotonic):
    deadline = now() + timeout
    while now() < deadline:
        result = api.request("GET", f"/deployments/{deployment}")
        status = str(result.get("status", "")).lower()
        if status == "finished":
            if result.get("commit") != source_sha:
                raise RuntimeError("Coolify finished a different source revision")
            return
        if status not in {"queued", "in_progress", "pending", "running"}:
            raise RuntimeError(f"Coolify deployment did not succeed (status: {status!r})")
        sleep(10)
    raise TimeoutError("Timed out waiting for Coolify deployment; inspect its queue before retrying")


def smoke_check(origin, sleep=time.sleep):
    opener = urllib.request.build_opener(NoRedirect())
    for attempt in range(18):
        try:
            with opener.open(origin + "/api/identity/setup/status", timeout=15) as response:
                result = json.load(response)
                if type(result.get("completed")) is bool:
                    return
        except (OSError, ValueError):
            pass
        sleep(5)
    raise RuntimeError("Public HTTPS/setup-status verification failed after deployment")


def deploy(args):
    manifest = validate_manifest(json.loads(Path(args.manifest).read_text()), Path.cwd(),
                                 args.repository, args.environment, args.source_sha)
    origin = private_coolify_url(required("COOLIFY_URL"))
    project = identifier(required("COOLIFY_PROJECT_UUID"), "Coolify project UUID")
    application = identifier(required("COOLIFY_APP_UUID"), "Coolify application UUID")
    if os.environ.get("PUBLIC_BASE_URL", manifest["public_url"]) != manifest["public_url"]:
        raise ValueError("PUBLIC_BASE_URL does not match the selected deployment environment")
    api = Api(origin, required("COOLIFY_CONFIG_TOKEN"), required("COOLIFY_DEPLOY_TOKEN"))
    validate_application(api, project, application, args.environment, args.repository)
    api.request("PATCH", f"/applications/{application}", {
        "git_commit_sha": args.source_sha, "git_branch": "main",
        "docker_compose_location": "/docker-compose.coolify.yml",
        "is_auto_deploy_enabled": False, "is_preserve_repository_enabled": False,
        "is_raw_compose_deployment_enabled": False,
    })
    api.request("PATCH", f"/applications/{application}/envs/bulk", env_payload(manifest))
    result = api.request("POST", "/deploy", {"uuid": application}, deploy=True)
    deployments = result.get("deployments", [])
    if len(deployments) != 1 or deployments[0].get("resource_uuid") != application:
        raise RuntimeError("Coolify did not return exactly the requested application deployment")
    deployment = identifier(deployments[0].get("deployment_uuid", ""), "deployment UUID")
    print(f"Waiting for Coolify deployment {deployment}", flush=True)
    wait_for_deployment(api, deployment, args.source_sha)
    smoke_check(manifest["public_url"])
    summary = os.environ.get("GITHUB_STEP_SUMMARY")
    if summary:
        with open(summary, "a") as stream:
            stream.write(f"Deployed `{args.source_sha}` to {manifest['public_url']}\n\nCoolify deployment: `{deployment}`\n\n")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--manifest", default=".release/manifest.json")
    parser.add_argument("--repository", required=True)
    parser.add_argument("--environment", choices=PUBLIC_URLS, required=True)
    parser.add_argument("--source-sha", required=True)
    deploy(parser.parse_args())
