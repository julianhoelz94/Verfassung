#!/usr/bin/env python3
"""Restore a seeded disposable Compose stack and verify persisted data and API fixtures."""

import argparse
import contextlib
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tempfile
import time
import urllib.request
import urllib.parse

from check import Client, DATABASES, content_checks, identifier, origin, queue_checks

ROOT = Path(__file__).resolve().parents[2]
WRITERS = [name + "-service" for name in DATABASES]


def validate_target(project, confirmation, base_url, config):
    if project != confirmation or not (project.startswith("verfassung-recovery-") or
                                      (project == "full-stack-e2e" and os.environ.get("CI") == "true")):
        raise ValueError("use a verfassung-recovery-* project and confirm its exact disposable name")
    if not re.fullmatch(r"[a-z0-9][a-z0-9_-]+", project):
        raise ValueError("invalid Compose project name")
    url = origin(base_url)
    if urllib.parse.urlsplit(url).hostname not in {"localhost", "127.0.0.1", "::1"}:
        raise ValueError("recovery drills only target loopback")
    services = config.get("services", {})
    if config.get("name") != project:
        raise ValueError("resolved Compose project does not match the disposable target")
    for name in DATABASES:
        service = services.get(name + "-service", {})
        if service.get("environment", {}).get("SPRING_PROFILES_ACTIVE") != "ci":
            raise ValueError("all recovery services must use synthetic CI fixtures")
    for volume in config.get("volumes", {}).values():
        if volume.get("external") or not str(volume.get("name", "")).startswith(project + "_"):
            raise ValueError("recovery refuses external or shared database volumes")
    for name in DATABASES:
        mounts = services.get(name + "-db", {}).get("volumes", [])
        if not mounts or any(mount.get("type") != "volume" or mount.get("source") not in config.get("volumes", {}) for mount in mounts):
            raise ValueError("recovery databases must use isolated named volumes")
    if not services["identity-service"].get("environment", {}).get("IDENTITY_MFA_ENCRYPTION_KEY"):
        raise ValueError("preserve the Identity encryption key before recovery")


class Stack:
    def __init__(self, project, env_file):
        self.command = ["docker", "compose", "--project-name", project, "--env-file", env_file]

    def run(self, *args, allow_failure=False, input_text=None):
        completed = subprocess.run(self.command + list(args), cwd=ROOT, input=input_text,
                                   text=True, capture_output=True, timeout=600)
        if completed.returncode and not allow_failure:
            # Output can contain fixture credentials or SQL; retain it only in
            # operator-controlled Docker logs, never in the portable report.
            raise RuntimeError("Compose step failed: " + args[0])
        return completed

    def sql(self, database, sql):
        return self.run("exec", "-T", database + "-db", "psql", "-U", "postgres", "-d", database + "_db",
                        "-X", "-A", "-t", "-v", "ON_ERROR_STOP=1", input_text=sql).stdout.strip()

    def backup(self, mount, *args, allow_failure=False, create=False):
        # postgres:16 runs arbitrary shell commands as root. Match the host caller
        # so umask 077 backups in the bind mount stay readable by the CI runner.
        options = ["run", "--rm", "--no-deps", "--user", f"{os.getuid()}:{os.getgid()}", "-v", mount]
        if create:
            options += ["-e", "BACKUP_ROOT=/recovery-backups", "-e", "BACKUP_RETENTION_DAYS=0", "-e", "BACKUP_WRITER_POLICY=quiesced"]
        return self.run(*options, "backup-service", *args, allow_failure=allow_failure)

    def fingerprint(self):
        result = {}
        for name in DATABASES:
            tables = self.sql(name, "SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename;").splitlines()
            if not tables or any(not re.fullmatch(r"[a-z_][a-z0-9_]*", table) for table in tables):
                raise RuntimeError("missing or unsupported recovery schema")
            statements = [f"SELECT '{table}', COUNT(*), md5(COALESCE(string_agg(row_to_json(t)::text, E'\\n' ORDER BY row_to_json(t)::text), '')) FROM public.\"{table}\" t;" for table in tables]
            result[name] = hashlib.sha256(self.sql(name, "\n".join(statements)).encode()).hexdigest()
        return result


def wait_ready(base_url):
    deadline = time.monotonic() + 180
    while time.monotonic() < deadline:
        try:
            for name in DATABASES:
                with urllib.request.urlopen(base_url + f"/api/{name}/actuator/health", timeout=5) as response:
                    if json.load(response).get("status") != "UP":
                        raise ValueError("service not ready")
            return
        except (OSError, ValueError):
            time.sleep(2)
    raise RuntimeError("restored services did not become healthy")


def document_snapshot(client, document_id, revision):
    document_id = identifier(document_id)
    revision = int(revision)
    if revision < 1:
        raise ValueError("invalid document revision")
    path = f"/api/document/documents/{document_id}"
    metadata = client.get(path + f"?revision={revision}")
    if not isinstance(metadata, dict) or not isinstance(metadata.get("revision"), dict):
        raise ValueError("invalid document metadata")
    pinned = metadata.get("revision", {})
    if metadata.get("id") != document_id or pinned.get("revision") != revision or pinned.get("documentId") != document_id:
        raise ValueError("document revision identity mismatch")
    request = urllib.request.Request(client.base_url + path + f"/revisions/{revision}/file",
                                     headers={"Accept": "application/octet-stream"})
    with client.opener.open(request, timeout=client.timeout) as response:
        data = response.read(20 * 1024 * 1024 + 1)
        if not data or len(data) > 20 * 1024 * 1024:
            raise ValueError("invalid recovered document size")
    return {"documentId": document_id, "revision": revision, "bytes": len(data),
            "sha256": hashlib.sha256(data).hexdigest(),
            "metadataSha256": hashlib.sha256(json.dumps(pinned, sort_keys=True).encode()).hexdigest()}


def public_document_snapshot(stack, client):
    candidates = stack.sql("document", "SELECT document_id::text || '|' || revision FROM document_revisions WHERE file_bytes IS NOT NULL AND octet_length(file_bytes) > 0 ORDER BY created_at DESC LIMIT 100;")
    for candidate in candidates.splitlines():
        try:
            document_id, revision = candidate.split("|")
            return document_snapshot(client, document_id, revision)
        except (OSError, ValueError, TypeError, AttributeError):
            continue
    raise RuntimeError("drill needs a publicly readable pinned source-document file")


def drill(args):
    stack = Stack(args.project, args.env_file)
    config = json.loads(stack.run("config", "--format", "json").stdout)
    validate_target(args.project, args.confirm_disposable, args.base_url, config)
    key = config["services"]["identity-service"]["environment"]["IDENTITY_MFA_ENCRYPTION_KEY"]
    key_hash = hashlib.sha256(key.encode()).digest()
    started = time.monotonic()
    public_client = Client(args.base_url)
    source_document = public_document_snapshot(stack, public_client)
    stack.run("stop", "edge-proxy", "gateway-web", "mcp-server", *WRITERS)
    before = stack.fingerprint()
    # Keep the private synthetic backup available after any later failure. It is
    # never uploaded with the report and can be removed after inspecting the drill.
    with contextlib.nullcontext(tempfile.mkdtemp(prefix="atlas-recovery-")) as directory:
        mount = directory + ":/recovery-backups"
        stack.backup(mount, create=True)
        backups = [path for path in Path(directory).iterdir() if path.is_dir()]
        if len(backups) != 1 or (backups[0] / "INCOMPLETE").exists():
            raise RuntimeError("drill did not create one completed backup")
        backup = backups[0]
        target = "/recovery-backups/" + backup.name
        original = (backup / "document.sql").read_bytes()
        (backup / "document.sql").write_bytes(original + b"\n-- corruption probe\n")
        failed = stack.backup(mount, "sh", "/backup/restore.sh", target, allow_failure=True)
        if failed.returncode == 0 or stack.fingerprint() != before:
            raise RuntimeError("corrupt backup was not rejected before touching databases")
        (backup / "document.sql").write_bytes(original)
        broken = Path(directory) / "failed-restore"
        shutil.copytree(backup, broken)
        broken_data = b"SELECT atlas_recovery_drill_missing_function();\n" + original
        (broken / "document.sql").write_bytes(broken_data)
        manifest = (broken / "SHA256SUMS").read_text()
        manifest = re.sub(r"^[0-9a-f]{64}  document\.sql$", hashlib.sha256(broken_data).hexdigest() + "  document.sql", manifest, flags=re.MULTILINE)
        (broken / "SHA256SUMS").write_text(manifest)
        # Simulate an empty host's databases in this explicitly disposable stack.
        for database in DATABASES:
            stack.sql(database, "DROP SCHEMA public CASCADE; CREATE SCHEMA public;")
        stack.sql("audit", "DROP OWNED BY audit_runtime; DROP ROLE audit_runtime;")
        restored = time.monotonic()
        interrupted = stack.backup(mount, "sh", "/backup/restore.sh", "/recovery-backups/failed-restore", allow_failure=True)
        if interrupted.returncode == 0 or "atlas_recovery_drill_missing_function" not in interrupted.stderr:
            raise RuntimeError("SQL failure did not stop the disposable restore")
        if stack.sql("document", "SELECT count(*) FROM pg_tables WHERE schemaname='public';") != "0":
            raise RuntimeError("SQL failure did not leave the expected partial restore")
        stack.backup(mount, "sh", "/backup/restore.sh", target)
        if stack.fingerprint() != before:
            raise RuntimeError("restored database contents differ from the quiesced backup")
        database_seconds = time.monotonic() - restored
    fresh_config = json.loads(stack.run("config", "--format", "json").stdout)
    fresh_key = fresh_config["services"]["identity-service"]["environment"]["IDENTITY_MFA_ENCRYPTION_KEY"]
    if hashlib.sha256(fresh_key.encode()).digest() != key_hash:
        raise RuntimeError("Identity encryption key changed during restore")
    stack.run("start", *WRITERS, "gateway-web", "mcp-server", "edge-proxy")
    wait_ready(args.base_url)
    if document_snapshot(public_client, source_document["documentId"], source_document["revision"]) != source_document:
        raise RuntimeError("restored source-document metadata or downloaded bytes changed")
    # Rebuild only the derived search index using an existing CI fixture token.
    token = config["services"]["ingestion-service"]["environment"]["INGESTION_SEARCH_TOKEN"]
    request = urllib.request.Request(args.base_url + "/api/search/reindex", method="POST",
                                     headers={"Authorization": "Bearer " + token})
    with urllib.request.urlopen(request, timeout=120) as response:
        if json.load(response).get("status") != "ready":
            raise RuntimeError("restored Search rebuild failed")
    checked = subprocess.run([args.node, "e2e/fixtures/prepopulate.mjs", "--verify-only"],
                             cwd=ROOT / "apps/gateway-web", env={**os.environ,
                                 "PREPOPULATE_BASE_URL": args.base_url, "PREPOPULATE_TEST_STACK": "true"},
                             text=True, capture_output=True, timeout=300)
    if checked.returncode:
        raise RuntimeError("restored authentication/content/amendment/search fixture read-back failed")
    fixture_ids = json.loads((ROOT / "apps/gateway-web/e2e/fixtures/generated/.runtime/prepopulate-ids.json").read_text())
    monitor = Client(args.base_url, config["services"]["identity-service"]["environment"]["IDENTITY_SEED_SERVICE_TOKEN"])
    version = monitor.get("/api/catalog/versions/" + fixture_ids["versions"]["xa-2024"])
    version_id = version.get("currentVersionId") or version["id"]
    jurisdiction_id = version["jurisdictionId"]
    probe = lambda: content_checks(monitor, version_id, jurisdiction_id, "dignity", "dignity")
    if not all(row["ok"] for row in probe()):
        raise RuntimeError("restored public reader/search canary failed")
    statuses = queue_checks(monitor, 86400, 1000000)
    if any("reason" in row for row in statuses):
        raise RuntimeError("protected operational aggregate status could not be read")
    stack.run("stop", "search-service")
    try:
        degraded = probe()
        if not degraded[0]["ok"] or degraded[1]["ok"]:
            raise RuntimeError("Search outage was not distinguished from healthy reader")
        # Identity remains healthy during the dependency failure.
        if monitor.get("/api/identity/actuator/health").get("status") != "UP":
            raise RuntimeError("Identity did not remain healthy during Search outage")
    finally:
        stack.run("start", "search-service")
    wait_ready(args.base_url)
    if not all(row["ok"] for row in probe()):
        raise RuntimeError("operational canary did not recover with Search")
    return {"ok": True, "project": args.project, "databasesVerified": DATABASES,
            "corruptBackupRejectedBeforeWrites": True, "emptyDatabaseRestore": True,
            "failedSqlRestoreRecovered": True,
            "encryptionKeyPreserved": True, "apiFixturesVerified": True,
            "sourceDocumentDownloadVerified": True,
            "searchOutageDetectedAndRecovered": True, "operationsStatusAuthorized": True,
            "databaseRestoreSeconds": round(database_seconds, 2),
            "backupDirectory": directory,
            "totalRecoverySeconds": round(time.monotonic() - started, 2)}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--project", required=True)
    parser.add_argument("--confirm-disposable", required=True)
    parser.add_argument("--env-file", default="env/ci.env.example")
    parser.add_argument("--base-url", default="http://127.0.0.1:18080")
    parser.add_argument("--node", default="node")
    parser.add_argument("--report", required=True)
    args = parser.parse_args()
    Path(args.report).parent.mkdir(parents=True, exist_ok=True)
    try:
        report = drill(args)
    except (ValueError, RuntimeError, OSError, KeyError, subprocess.TimeoutExpired) as error:
        # On failure leave the disposable installation for inspection/recovery.
        report = {"ok": False, "reason": str(error), "action": "Inspect the disposable stack; do not reuse this procedure on a live installation."}
    Path(args.report).write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps(report, indent=2))
    return 0 if report["ok"] else 1


if __name__ == "__main__":
    sys.exit(main())
