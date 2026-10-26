#!/usr/bin/env python3
"""Select one compiled release in Coolify and await its deployment result."""

import argparse
import ipaddress
import json
import os
import re
import secrets
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

from release import PUBLIC_URLS, UUID, image_variable, validate_manifest

SHARED_VARIABLES = (
    "POSTGRES_PASSWORD", "IDENTITY_MFA_ENCRYPTION_KEY", "PROD_ADMIN_EMAIL",
    "PROD_ADMIN_PASSWORD", "TLS_TRUSTED_PROXIES",
)
COMPOSE_NOT_LOADED = (
    "Cannot set docker_compose_domains without docker_compose_raw. "
    "Reload the compose file from the git repository first."
)


class ComposeNotLoaded(RuntimeError):
    """Coolify is still loading the new application's Compose file from Git."""


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
    if not isinstance(value, str) or not UUID.fullmatch(value):
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
                if method == "GET" and path == "/version":
                    version = response.read(256).decode().strip().strip('"')
                    if not re.fullmatch(r"v?\d+\.\d+\.\d+(?:[-.][A-Za-z0-9]+)*", version):
                        raise ValueError("Coolify returned an invalid version")
                    return version
                return json.load(response)
        except urllib.error.HTTPError as error:
            # Never print response values: validation messages can echo secrets.
            details = []
            if error.code == 422:
                try:
                    body = json.loads(error.read(65536))
                    if body.get("errors", {}).get("docker_compose_domains") == COMPOSE_NOT_LOADED:
                        raise ComposeNotLoaded("Coolify has not loaded the Compose file yet") from None
                    for field, messages in body.get("errors", {}).items():
                        if field not in (payload or {}) or not re.fullmatch(r"[a-z_]+", field):
                            continue
                        messages = messages if isinstance(messages, list) else [messages]
                        reason = "This field is not allowed." if "This field is not allowed." in messages else "Validation failed."
                        details.append(f"{field}: {reason}")
                except (ValueError, AttributeError, TypeError):
                    pass
            suffix = " (" + "; ".join(details) + ")" if details else ""
            raise RuntimeError(f"Coolify {method} {path} returned HTTP {error.code}{suffix}") from None


def canonical_domain(value):
    parsed = urllib.parse.urlsplit(value)
    if parsed.scheme != "https" or parsed.username or parsed.password or parsed.path not in {"", "/"} or parsed.query or parsed.fragment:
        return None
    if parsed.port not in {None, 80, 443}:
        return None
    return "https://" + (parsed.hostname or "")


def repository_name(value):
    value = re.sub(r"\.git$", "", str(value).rstrip("/")).lower()
    # Coolify stores public GitHub repositories as owner/repository.
    return re.sub(r"^https://github.com/", "", value)


def validate_domains(app, environment, allow_empty=False):
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
    if allow_empty and not any(value.strip() for value in domain_values):
        return
    origins = {canonical_domain(value.strip()) for value in domain_values}
    if origins != {PUBLIC_URLS[environment]}:
        raise ValueError(f"Assign only {PUBLIC_URLS[environment]} to edge-proxy in this Coolify application")


def validate_application(api, project, application, server, environment, repository):
    result = api.request("GET", f"/projects/{project}/{environment}")
    applications = result.get("applications", []) if isinstance(result, dict) else []
    if not any(isinstance(item, dict) and item.get("uuid") == application for item in applications):
        raise ValueError("Coolify application does not belong to the selected project environment")
    app = api.request("GET", f"/applications/{application}")
    if app.get("build_pack") != "dockercompose" or repository_name(app.get("git_repository", "")) != repository.lower():
        raise ValueError("The selected Coolify application is not this repository's Git-based Compose application")
    if app.get("settings", {}).get("is_container_label_readonly_enabled") is not True:
        raise ValueError("Enable Readonly labels in the Coolify application's advanced configuration before deploying")
    if app.get("settings", {}).get("traefik_certificate_resolver") not in {None, "", "letsencrypt"}:
        raise ValueError("Use the default or letsencrypt certificate resolver in the Coolify application before deploying")
    if any(app.get(key) for key in ("docker_compose_custom_build_command", "docker_compose_custom_start_command",
                                    "pre_deployment_command", "post_deployment_command")):
        raise ValueError("Remove custom Compose commands and deployment hooks before using the image-only CD workflow")
    destinations = api.request("GET", f"/applications/{application}/destinations")
    if (not isinstance(destinations, list) or len(destinations) != 1
            or destinations[0].get("is_primary") is not True or destinations[0].get("server_uuid") != server):
        raise ValueError("The Coolify application must have exactly one destination on COOLIFY_SERVER_UUID")
    validate_domains(app, environment, allow_empty=True)
    return app


def require_shared_variables(api, project, environment):
    values = api.request("GET", f"/projects/{project}/environments/{environment}/envs")
    keys = {item.get("key") for item in values if isinstance(item, dict)} if isinstance(values, list) else set()
    missing = sorted(set(SHARED_VARIABLES) - keys)
    if missing:
        raise ValueError("Set these Coolify environment-wide shared variables before deploying: " + ", ".join(missing))


def application_settings(manifest):
    return {
        "git_commit_sha": manifest["source_sha"], "git_branch": "main", "base_directory": "/",
        "docker_compose_location": "/docker-compose.coolify.yml",
        "is_auto_deploy_enabled": False, "is_preview_deployments_enabled": False,
        "is_preserve_repository_enabled": False, "is_raw_compose_deployment_enabled": False,
        # Released Coolify APIs reject the read-only-label setting. New apps
        # default to managed labels; validate_application verifies that default.
        # The proxy's configured letsencrypt resolver is the application default.
        "is_force_https_enabled": True, "instant_deploy": False,
        "manual_webhook_secret_github": None, "manual_webhook_secret_gitlab": None,
        "manual_webhook_secret_bitbucket": None, "manual_webhook_secret_gitea": None,
        "docker_compose_domains": [{"name": "edge-proxy", "domain": manifest["public_url"] + ":80", "redirect": "both"}],
    }


def ensure_application(api, project, server, environment, repository, manifest, application_override=""):
    result = api.request("GET", f"/projects/{project}/{environment}")
    if not isinstance(result, dict) or not isinstance(result.get("applications"), list):
        raise ValueError("Coolify did not return the selected environment's application list")
    applications = result["applications"]
    name = "constitution-atlas-" + environment
    if application_override:
        application = identifier(application_override, "Coolify application UUID")
    else:
        matches = [item for item in applications if isinstance(item, dict) and item.get("name") == name]
        if len(matches) > 1:
            raise ValueError(f"Multiple Coolify applications named {name}; resolve the ambiguity before deploying")
        if matches:
            application = identifier(matches[0].get("uuid", ""), "Coolify application UUID")
        else:
            if any(isinstance(item, dict) and repository_name(item.get("git_repository", "")) == repository.lower()
                   for item in applications):
                raise ValueError("An existing application uses this repository; set optional COOLIFY_APP_UUID to reuse it")
            payload = application_settings(manifest)
            payload.update({"name": name, "project_uuid": project, "server_uuid": server,
                            "environment_name": environment, "git_repository": "https://github.com/" + repository,
                            "build_pack": "dockercompose", "autogenerate_domain": False})
            # Do not retry a creation request after a lost response. A later manual run
            # rediscovers this name, preserving the application's UUID and volumes.
            created = api.request("POST", "/applications/public", payload)
            application = identifier(created.get("uuid", ""), "Coolify application UUID")
    validate_application(api, project, application, server, environment, repository)
    return application


def configure_application(api, application, manifest, timeout=300, sleep=time.sleep, now=time.monotonic):
    deadline = now() + timeout
    while now() < deadline:
        try:
            api.request("PATCH", f"/applications/{application}", application_settings(manifest))
            return
        except ComposeNotLoaded:
            sleep(5)
    raise TimeoutError("Coolify did not load the Compose file; inspect application configuration and retry using the same application")


def env_payload(manifest):
    values = {image_variable(service): image for service, image in manifest["images"].items()}
    values.update({
        "PUBLIC_BASE_URL": manifest["public_url"],
        "NEXT_PUBLIC_BASE_URL": manifest["public_url"],
        "PROFILE": "production", "TLS_MODE": "external-proxy",
        "SESSION_COOKIE_SECURE": "true", "IDENTITY_SEED_MODE": "off",
        "CADDY_EXPOSE_API_DOCS": "false",
    })
    values.update({key: "{{environment." + key + "}}" for key in SHARED_VARIABLES})
    # The production identity bootstrap registers these hashes with one narrow
    # scope each. Both services receive the same release-specific credentials;
    # demo seeding remains off. Never print/persist this payload in release logs.
    values.update({"INGESTION_" + purpose + "_TOKEN": secrets.token_urlsafe(48)
                   for purpose in ("PUBLISH", "AUDIT", "SEARCH")})
    # Coolify invokes Compose's build phase even for an image-only stack. Compose
    # must resolve every required input then as well as during container startup.
    return {"data": [{"key": key, "value": value, "is_preview": False,
                      "is_buildtime": True, "is_runtime": True, "is_literal": True}
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
    server = identifier(required("COOLIFY_SERVER_UUID"), "Coolify server UUID")
    if os.environ.get("PUBLIC_BASE_URL", manifest["public_url"]) != manifest["public_url"]:
        raise ValueError("PUBLIC_BASE_URL does not match the selected deployment environment")
    api = Api(origin, required("COOLIFY_CONFIG_TOKEN"), required("COOLIFY_DEPLOY_TOKEN"))
    require_shared_variables(api, project, args.environment)
    print(f"Coolify version: {api.request('GET', '/version')}", flush=True)
    application = ensure_application(api, project, server, args.environment, args.repository, manifest,
                                     os.environ.get("COOLIFY_APP_UUID", "").strip())
    configure_application(api, application, manifest)
    api.request("PATCH", f"/applications/{application}/envs/bulk", env_payload(manifest))
    validate_domains(api.request("GET", f"/applications/{application}"), args.environment)
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
            stream.write(f"Deployed `{args.source_sha}` to {manifest['public_url']}\n\nCoolify application: `{application}`\n\nCoolify deployment: `{deployment}`\n\n")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--manifest", default=".release/manifest.json")
    parser.add_argument("--repository", required=True)
    parser.add_argument("--environment", choices=PUBLIC_URLS, required=True)
    parser.add_argument("--source-sha", required=True)
    deploy(parser.parse_args())
