"""Check restore preflight with fake database commands; never connect to a database."""
import os
import hashlib
from pathlib import Path
import subprocess
import tempfile
import time
import unittest


class RestorePreflightTest(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.root = Path(self.directory.name)
        self.events = self.root / "events"
        self.backup = self.root / "backup"
        self.backup.mkdir()
        self.bin = self.root / "bin"
        self.bin.mkdir()
        for command in ("pg_isready", "psql"):
            path = self.bin / command
            path.write_text('#!/bin/sh\nprintf "%s\\n" "$0 $*" >> "$RESTORE_TEST_EVENTS"\n')
            path.chmod(0o755)
        self.script = Path(__file__).resolve().parents[1] / "infra/backup/restore.sh"
        self.databases = "catalog content amendment identity editor audit ingestion search document".split()

    def run_restore(self):
        return subprocess.run(
            ["sh", str(self.script), str(self.backup)],
            env={**os.environ, "PATH": str(self.bin) + os.pathsep + os.environ["PATH"],
                 "RESTORE_TEST_EVENTS": str(self.events)},
            text=True, capture_output=True, timeout=10,
        )

    def write_verified_backup(self):
        checksums = []
        for database in self.databases:
            data = b"SELECT 1;\n"
            (self.backup / (database + ".sql")).write_bytes(data)
            checksums.append(hashlib.sha256(data).hexdigest() + "  " + database + ".sql")
        (self.backup / "SHA256SUMS").write_text("\n".join(checksums) + "\n")
        (self.backup / "backup.meta").write_text("format=1\ncreated_at=2026-10-26T12:00:00Z\nwriter_policy=quiesced\n")

    def test_verified_backup_checks_all_files_before_restoring(self):
        self.write_verified_backup()
        result = self.run_restore()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(len(self.events.read_text().splitlines()), 28)

    def test_corrupted_last_dump_never_touches_a_database(self):
        self.write_verified_backup()
        (self.backup / "document.sql").write_text("SELECT 'tampered';\n")
        result = self.run_restore()
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("checksum mismatch", result.stderr)
        self.assertFalse(self.events.exists())

    def test_missing_duplicate_and_outside_manifest_entries_fail_before_restore(self):
        self.write_verified_backup()
        manifest = self.backup / "SHA256SUMS"
        original = manifest.read_text()
        for malformed in ("\n".join(original.splitlines()[:-1]) + "\n",
                          original.replace("document.sql", "../document.sql"),
                          original.replace("document.sql", "catalog.sql")):
            with self.subTest(manifest=malformed):
                manifest.write_text(malformed)
                self.assertNotEqual(self.run_restore().returncode, 0)
                self.assertFalse(self.events.exists())

    def test_partial_manifest_does_not_become_a_legacy_backup(self):
        self.write_verified_backup()
        (self.backup / "SHA256SUMS").unlink()
        self.assertNotEqual(self.run_restore().returncode, 0)
        self.assertFalse(self.events.exists())

    def test_missing_last_dump_does_not_touch_any_database(self):
        for database in self.databases[:-1]:
            (self.backup / (database + ".sql")).write_text("SELECT 1;\n")
        result = self.run_restore()
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("document.sql", result.stderr)
        self.assertFalse(self.events.exists())

    def test_empty_dump_does_not_touch_any_database(self):
        for database in self.databases:
            (self.backup / (database + ".sql")).touch()
        self.assertNotEqual(self.run_restore().returncode, 0)
        self.assertFalse(self.events.exists())

    def test_incomplete_nonempty_backup_does_not_touch_any_database(self):
        for database in self.databases:
            (self.backup / (database + ".sql")).write_text("SELECT 1;\n")
        (self.backup / "INCOMPLETE").touch()
        result = self.run_restore()
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("incomplete", result.stderr)
        self.assertFalse(self.events.exists())

    def test_complete_backup_restores_every_database(self):
        for database in self.databases:
            (self.backup / (database + ".sql")).write_text("SELECT 1;\n")
        result = self.run_restore()
        self.assertEqual(result.returncode, 0, result.stderr)
        events = self.events.read_text().splitlines()
        self.assertEqual(len(events), 28)
        for database in self.databases:
            self.assertEqual(sum("psql " in event and (database + "_db ") in event for event in events), 3 if database == "audit" else 2)

    def test_directory_disguised_as_dump_does_not_touch_any_database(self):
        for database in self.databases:
            (self.backup / (database + ".sql")).write_text("SELECT 1;\n")
        disguised = self.backup / "catalog.sql"
        disguised.unlink()
        disguised.mkdir()
        self.assertNotEqual(self.run_restore().returncode, 0)
        self.assertFalse(self.events.exists())


class BackupTest(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.root = Path(self.directory.name)
        self.backups = self.root / "backups"
        self.backups.mkdir()
        self.bin = self.root / "bin"
        self.bin.mkdir()
        for command, source in {
            "date": '#!/bin/sh\ncase "$*" in *%Y-%m-%d*) printf "2026-10-23T12:00:00Z\\n";; *) printf "20261023-120000\\n";; esac\n',
            "pg_isready": '#!/bin/sh\nexit 0\n',
            "pg_dump": '#!/bin/sh\nprintf "SELECT 1;\\n"\n[ "$*" != "-h document-db -U postgres -d document_db" ] || [ "${FAIL_LAST_DUMP:-0}" != 1 ]\n',
        }.items():
            path = self.bin / command
            path.write_text(source)
            path.chmod(0o755)
        self.script = Path(__file__).resolve().parents[1] / "infra/backup/backup.sh"

    def run_backup(self, **env):
        return subprocess.run(
            ["sh", str(self.script)],
            env={**os.environ, "PATH": str(self.bin) + os.pathsep + os.environ["PATH"],
                 "BACKUP_ROOT": str(self.backups), "BACKUP_RETENTION_DAYS": "1", **env},
            text=True, capture_output=True, timeout=10,
        )

    def test_last_dump_failure_keeps_incomplete_marker(self):
        result = self.run_backup(FAIL_LAST_DUMP="1")
        self.assertNotEqual(result.returncode, 0)
        backup = self.backups / "20261023-120000"
        self.assertEqual(len(list(backup.glob("*.sql"))), 9)
        self.assertGreater((backup / "document.sql").stat().st_size, 0)
        self.assertTrue((backup / "INCOMPLETE").exists())
        self.assertNotIn("Backup completed", result.stdout)

    def test_success_is_private_and_never_overwrites_an_existing_backup(self):
        result = self.run_backup()
        self.assertEqual(result.returncode, 0, result.stderr)
        backup = self.backups / "20261023-120000"
        self.assertFalse((backup / "INCOMPLETE").exists())
        self.assertEqual(len(list(backup.glob("*.sql"))), 9)
        self.assertEqual(backup.stat().st_mode & 0o777, 0o700)
        self.assertEqual((backup / "catalog.sql").stat().st_mode & 0o777, 0o600)
        self.assertEqual(len((backup / "SHA256SUMS").read_text().splitlines()), 9)
        self.assertIn("created_at=2026-10-23T12:00:00Z", (backup / "backup.meta").read_text())
        self.assertIn("writer_policy=online", (backup / "backup.meta").read_text())
        (backup / "catalog.sql").write_text("original")
        self.assertNotEqual(self.run_backup().returncode, 0)
        self.assertEqual((backup / "catalog.sql").read_text(), "original")

    def test_retention_only_removes_completed_timestamp_directories(self):
        old = time.time() - 5 * 24 * 60 * 60
        for name in ("20260101-120000", "20260102-120000", "operator-notes"):
            path = self.backups / name
            path.mkdir()
            if name == "20260102-120000":
                (path / "INCOMPLETE").touch()
            os.utime(path, (old, old))
        result = self.run_backup()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertFalse((self.backups / "20260101-120000").exists())
        self.assertTrue((self.backups / "20260102-120000/INCOMPLETE").exists())
        self.assertTrue((self.backups / "operator-notes").is_dir())


if __name__ == "__main__":
    unittest.main()
