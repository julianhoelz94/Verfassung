#!/usr/bin/env python3
"""CI-6: publish via editor (ED-4) and assert the source version bytes are unchanged."""

from __future__ import annotations

import hmac
import json
import os
import struct
import sys
import time
import urllib.error
import urllib.request
from typing import Any

SOURCE_VERSION_ID = "01900000-0000-4000-8000-000000000004"
SOURCE_ARTICLE_ID = "01900000-0000-4000-8000-000000000201"
DRAFT_TITLE = "Human dignity"
DRAFT_BODY = "CI-6 publish journey draft body."
TOTP_PERIOD = 30
TOTP_DIGITS = 6
BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567"


def env(name: str, default: str | None = None) -> str:
    value = os.environ.get(name, default)
    if value is None or value == "":
        raise SystemExit(f"missing environment variable {name}")
    return value


def identity_url() -> str:
    return env("IDENTITY_URL", "http://127.0.0.1:18081").rstrip("/")


def catalog_url() -> str:
    return env("CATALOG_URL", "http://127.0.0.1:18082").rstrip("/")


def content_url() -> str:
    return env("CONTENT_URL", "http://127.0.0.1:18083").rstrip("/")


def editor_url() -> str:
    return env("EDITOR_URL", "http://127.0.0.1:18084").rstrip("/")


def b32decode(text: str) -> bytes:
    cleaned = text.strip().upper().replace("=", "").replace(" ", "")
    buffer = 0
    bits_left = 0
    out = bytearray()
    for char in cleaned:
        value = BASE32.find(char)
        if value < 0:
            raise ValueError(f"invalid base32 character {char!r}")
        buffer = (buffer << 5) | value
        bits_left += 5
        if bits_left >= 8:
            out.append((buffer >> (bits_left - 8)) & 0xFF)
            bits_left -= 8
    return bytes(out)


def totp(secret: str, now: float | None = None) -> str:
    counter = int((time.time() if now is None else now) // TOTP_PERIOD)
    digest = hmac.new(b32decode(secret), struct.pack(">Q", counter), "sha1").digest()
    offset = digest[-1] & 0x0F
    binary = struct.unpack(">I", digest[offset : offset + 4])[0] & 0x7FFFFFFF
    return str(binary % (10**TOTP_DIGITS)).zfill(TOTP_DIGITS)


def http(
    method: str,
    url: str,
    body: Any | None = None,
    token: str | None = None,
    timeout: int = 30,
) -> tuple[int, Any]:
    data = None
    headers = {"Accept": "application/json"}
    if body is not None:
        data = json.dumps(body).encode()
        headers["Content-Type"] = "application/json"
    if token:
        headers["Authorization"] = f"Bearer {token}"
    request = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            raw = response.read()
            payload: Any = None
            if raw:
                try:
                    payload = json.loads(raw.decode())
                except json.JSONDecodeError:
                    payload = raw.decode()
            return response.status, payload
    except urllib.error.HTTPError as error:
        raw = error.read()
        payload: Any = raw.decode(errors="replace")
        try:
            payload = json.loads(payload)
        except json.JSONDecodeError:
            pass
        return error.code, payload


def wait_for_ping(base: str, name: str, attempts: int = 90) -> None:
    url = f"{base}/internal/ping"
    last = "no response"
    for _ in range(attempts):
        try:
            status, payload = http("GET", url, timeout=5)
            if status == 200:
                return
            last = f"HTTP {status} {payload}"
        except urllib.error.URLError as error:
            last = str(error.reason if hasattr(error, "reason") else error)
        time.sleep(2)
    raise SystemExit(f"{name} did not become ready at {url}: {last}")


def login(email: str, password: str, secret: str) -> str:
    status, payload = http("POST", f"{identity_url()}/login", {"email": email, "password": password})
    if status != 200 or not isinstance(payload, dict):
        raise SystemExit(f"login failed for {email}: HTTP {status} {payload}")
    if payload.get("mfaEnrollmentRequired"):
        raise SystemExit(f"login for {email} requires MFA enrollment")
    if payload.get("mfaRequired"):
        challenge = payload.get("challengeToken")
        status, payload = http(
            "POST",
            f"{identity_url()}/login/mfa",
            {"challengeToken": challenge, "code": totp(secret)},
        )
        if status != 200 or not isinstance(payload, dict):
            raise SystemExit(f"MFA login failed for {email}: HTTP {status} {payload}")
    token = payload.get("token")
    if not token:
        raise SystemExit(f"login for {email} returned no session token: {payload}")
    return str(token)


def step_up(token: str, secret: str) -> None:
    status, payload = http("POST", f"{identity_url()}/mfa/step-up", {"code": totp(secret)}, token)
    if status not in (200, 204):
        raise SystemExit(f"step-up failed: HTTP {status} {payload}")


def article_body(version_id: str, article_id: str | None = None, article_number: str | None = None) -> str:
    status, payload = http(
        "GET",
        f"{content_url()}/versions/{version_id}/articles?includeBody=true&limit=200",
    )
    if status != 200 or not isinstance(payload, list):
        raise SystemExit(f"list articles failed for {version_id}: HTTP {status} {payload}")
    for article in payload:
        if article_id and article.get("id") == article_id:
            return str(article.get("body") or "")
        if article_number and str(article.get("articleNumber")) == article_number:
            return str(article.get("body") or "")
    raise SystemExit(f"article not found on {version_id} (id={article_id} number={article_number})")


def editor(method: str, path: str, token: str, body: Any | None = None) -> Any:
    status, payload = http(method, f"{editor_url()}{path}", body, token)
    if status >= 400:
        raise SystemExit(f"editor {method} {path} failed: HTTP {status} {payload}")
    return payload


def main() -> None:
    secret = env("IDENTITY_SEED_TOTP_SECRET", "CAATLASMFASEED22")
    editor_email = env("CI_EDITOR_EMAIL", "ci-editor@example.local")
    editor_password = env("CI_EDITOR_PASSWORD", "change-me")
    reviewer_email = env("CI_REVIEWER_EMAIL", "ci-reviewer@example.local")
    reviewer_password = env("CI_REVIEWER_PASSWORD", "change-me")
    publisher_email = env("CI_PUBLISHER_EMAIL", "ci-publisher@example.local")
    publisher_password = env("CI_PUBLISHER_PASSWORD", "change-me")

    wait_for_ping(identity_url(), "identity")
    wait_for_ping(catalog_url(), "catalog")
    wait_for_ping(content_url(), "content")
    wait_for_ping(editor_url(), "editor")

    status, version = http("GET", f"{catalog_url()}/versions/{SOURCE_VERSION_ID}")
    if status != 200:
        raise SystemExit(f"source catalog version missing: HTTP {status} {version}")

    source_before = article_body(SOURCE_VERSION_ID, article_id=SOURCE_ARTICLE_ID)

    editor_token = login(editor_email, editor_password, secret)
    session = editor("POST", "/edit-sessions", editor_token, {"versionId": SOURCE_VERSION_ID})
    session_id = session["id"]
    editor(
        "POST",
        f"/edit-sessions/{session_id}/saves",
        editor_token,
        {"articleId": SOURCE_ARTICLE_ID, "title": DRAFT_TITLE, "body": DRAFT_BODY},
    )
    editor("POST", f"/edit-sessions/{session_id}/review", editor_token)

    reviewer_token = login(reviewer_email, reviewer_password, secret)
    editor("POST", f"/edit-sessions/{session_id}/approval", reviewer_token)

    publisher_token = login(publisher_email, publisher_password, secret)
    status, principal = http("GET", f"{identity_url()}/me", token=publisher_token)
    if status != 200 or not isinstance(principal, dict):
        raise SystemExit(f"publisher /me failed: HTTP {status} {principal}")
    if not principal.get("stepUpFresh"):
        step_up(publisher_token, secret)
    preview = editor("POST", f"/edit-sessions/{session_id}/publish", publisher_token)
    new_version_id = preview.get("newVersionId")
    if not new_version_id:
        raise SystemExit(f"publish returned no newVersionId: {preview}")
    if preview.get("session", {}).get("status") != "published":
        raise SystemExit(f"session was not published: {preview}")

    source_after = article_body(SOURCE_VERSION_ID, article_id=SOURCE_ARTICLE_ID)
    if source_after != source_before:
        raise SystemExit("source version body changed after publish")

    new_body = article_body(new_version_id, article_number="1")
    if new_body != DRAFT_BODY:
        raise SystemExit(f"successor article 1 body mismatch: {new_body!r}")

    print(f"ok: source {SOURCE_VERSION_ID} unchanged; successor {new_version_id} has draft text")


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        sys.exit(130)
