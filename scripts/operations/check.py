#!/usr/bin/env python3
"""Read-only usability, delivery and backup checks; exits nonzero when degraded."""

import argparse
import datetime as dt
import hashlib
import html
import json
import os
from pathlib import Path
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid


DATABASES = "catalog content amendment identity editor audit ingestion search document".split()
MAX_RESPONSE = 4 * 1024 * 1024


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def origin(value):
    parsed = urllib.parse.urlsplit(value)
    if (parsed.scheme not in {"http", "https"} or not parsed.hostname or parsed.username
            or parsed.password or parsed.query or parsed.fragment or parsed.path not in {"", "/"}):
        raise ValueError("base URL must be an HTTP(S) origin without credentials or a path")
    if parsed.scheme == "http" and parsed.hostname not in {"localhost", "127.0.0.1", "::1"}:
        raise ValueError("use HTTPS outside loopback")
    return value.rstrip("/")


def identifier(value):
    return str(uuid.UUID(value))


class Client:
    def __init__(self, base_url, token="", timeout=10):
        self.base_url = origin(base_url)
        self.token = token
        self.timeout = timeout
        self.opener = urllib.request.build_opener(NoRedirect())

    def get(self, path, *, authenticated=False, as_json=True):
        headers = {"Accept": "application/json" if as_json else "text/html"}
        if authenticated:
            if not self.token:
                raise ValueError("ATLAS_OPERATIONS_TOKEN is required for delivery checks")
            headers["Authorization"] = "Bearer " + self.token
        request = urllib.request.Request(self.base_url + path, headers=headers)
        with self.opener.open(request, timeout=self.timeout) as response:
            body = response.read(MAX_RESPONSE + 1)
            if len(body) > MAX_RESPONSE:
                raise ValueError("response exceeds monitoring limit")
            return json.loads(body) if as_json else body.decode("utf-8")


def queue_checks(client, max_age, max_failed):
    result = []
    for service in ("identity", "editor", "ingestion"):
        name = service + "-delivery"
        try:
            status = client.get(f"/api/{service}/operations/status", authenticated=True)
            if not isinstance(status, dict) or status.get("service") != service or not isinstance(status.get("queues"), list) or not status["queues"]:
                raise ValueError("invalid operations status")
            for queue in status["queues"]:
                if not isinstance(queue, dict):
                    raise ValueError("invalid queue status")
                counts = [queue.get(key) for key in ("pendingCount", "failedCount", "oldestAgeSeconds")]
                if not isinstance(queue.get("name"), str) or any(type(n) is not int or n < 0 for n in counts):
                    raise ValueError("invalid queue counts")
                pending, failed, age = counts
                degraded = age > max_age or failed > max_failed
                result.append({"name": service + ":" + queue["name"], "ok": not degraded,
                               "pendingCount": pending, "failedCount": failed, "oldestAgeSeconds": age,
                               "action": "Inspect the owning service delivery errors or resume the reviewed import." if degraded else ""})
        except (OSError, ValueError, TypeError, KeyError) as error:
            result.append(failure(name, error, "Check service reachability and the monitoring token's operations:read scope/expiry."))
    return result


def failure(name, error, action):
    # Do not include response bodies, URLs, headers or exceptions containing credentials.
    reason = "HTTP " + str(error.code) if isinstance(error, urllib.error.HTTPError) else type(error).__name__
    return {"name": name, "ok": False, "reason": reason, "action": action}


def content_checks(client, version_id, jurisdiction_id, query, expected_text):
    result = []
    version_id, jurisdiction_id = identifier(version_id), identifier(jurisdiction_id)
    try:
        version = client.get("/api/catalog/versions/" + version_id)
        if (not isinstance(version, dict) or version.get("id") != version_id or version.get("publicationStatus") != "published"
                or version.get("jurisdictionId") != jurisdiction_id):
            raise ValueError("published snapshot ownership mismatch")
        page = client.get(f"/jurisdictions/{jurisdiction_id}/versions/{version_id}", as_json=False)
        if expected_text not in html.unescape(page):
            raise ValueError("expected published text missing")
        result.append({"name": "published-reader", "ok": True})
    except (OSError, ValueError, TypeError, KeyError) as error:
        result.append(failure("published-reader", error, "Check Catalog, Content and the configured published reader fixture."))
    try:
        args = urllib.parse.urlencode({"q": query, "versionId": version_id, "jurisdictionId": jurisdiction_id, "limit": 20})
        page = client.get("/api/search/search?" + args)
        if not isinstance(page, dict):
            raise ValueError("invalid search page")
        hits = page.get("hits", [])
        if not isinstance(hits, list) or not any(isinstance(hit, dict) and hit.get("versionId") == version_id for hit in hits):
            raise ValueError("expected indexed snapshot missing")
        result.append({"name": "published-search", "ok": True})
    except (OSError, ValueError, TypeError, KeyError) as error:
        result.append(failure("published-search", error, "Check Search availability/index delivery and the configured query."))
    return result


def backup_check(root, max_age, now=None):
    now = time.time() if now is None else now
    try:
        candidates = sorted(path for path in Path(root).iterdir()
                            if path.is_dir() and re.fullmatch(r"\d{8}-\d{6}", path.name)
                            and not (path / "INCOMPLETE").exists())
        if not candidates:
            raise ValueError("no completed backup")
        latest = candidates[-1]
        metadata = dict(line.split("=", 1) for line in (latest / "backup.meta").read_text().splitlines())
        if metadata.get("format") != "1":
            raise ValueError("unsupported backup manifest")
        created = dt.datetime.fromisoformat(metadata["created_at"].replace("Z", "+00:00"))
        if created.tzinfo is None:
            raise ValueError("backup timestamp needs timezone")
        age = now - created.timestamp()
        if age < -300:
            raise ValueError("backup timestamp is in the future")
        expected = {}
        for line in (latest / "SHA256SUMS").read_text().splitlines():
            checksum, filename = line.split(None, 1)
            filename = filename.strip().removeprefix("*")
            if not re.fullmatch(r"[0-9a-f]{64}", checksum) or filename in expected:
                raise ValueError("invalid checksum manifest")
            expected[filename] = checksum
        if set(expected) != {name + ".sql" for name in DATABASES}:
            raise ValueError("incomplete checksum manifest")
        for filename, checksum in expected.items():
            path = latest / filename
            if path.is_symlink() or not path.is_file() or path.stat().st_size == 0:
                raise ValueError("invalid backup file")
            digest = hashlib.sha256()
            with path.open("rb") as stream:
                for chunk in iter(lambda: stream.read(1024 * 1024), b""):
                    digest.update(chunk)
            if digest.hexdigest() != checksum:
                raise ValueError("backup checksum mismatch")
        return {"name": "backup", "ok": age <= max_age, "ageSeconds": max(0, int(age)),
                "writerPolicy": metadata.get("writer_policy", "unknown"),
                "action": "Create and verify a fresh backup." if age > max_age else ""}
    except (OSError, ValueError, TypeError, KeyError) as error:
        return failure("backup", error, "Inspect the latest backup, completion marker, manifest and checksums.")


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base-url", required=True)
    parser.add_argument("--version-id", required=True)
    parser.add_argument("--jurisdiction-id", required=True)
    parser.add_argument("--query", required=True)
    parser.add_argument("--expected-text", required=True)
    parser.add_argument("--backup-root", required=True)
    parser.add_argument("--max-queue-age", type=int, default=300)
    parser.add_argument("--max-failed", type=int, default=0)
    parser.add_argument("--max-backup-age", type=int, default=86400)
    args = parser.parse_args(argv)
    try:
        if min(args.max_queue_age, args.max_failed, args.max_backup_age) < 0:
            raise ValueError("thresholds must be nonnegative")
        if not args.query.strip() or not args.expected_text.strip():
            raise ValueError("query and expected text must be nonempty")
        client = Client(args.base_url, os.environ.get("ATLAS_OPERATIONS_TOKEN", ""))
        checks = content_checks(client, args.version_id, args.jurisdiction_id, args.query, args.expected_text)
        checks += queue_checks(client, args.max_queue_age, args.max_failed)
        checks.append(backup_check(args.backup_root, args.max_backup_age))
    except (ValueError, TypeError) as error:
        parser.error(str(error))
    ok = all(check["ok"] for check in checks)
    print(json.dumps({"ok": ok, "checks": checks}, indent=2))
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
