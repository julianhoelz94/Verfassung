"""Check restore preflight with fake database commands; never connect to a database."""
import os
from pathlib import Path
import subprocess
import tempfile
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

    def test_complete_backup_restores_every_database(self):
        for database in self.databases:
            (self.backup / (database + ".sql")).write_text("SELECT 1;\n")
        result = self.run_restore()
        self.assertEqual(result.returncode, 0, result.stderr)
        events = self.events.read_text().splitlines()
        self.assertEqual(len(events), 27)
        for database in self.databases:
            self.assertEqual(sum("psql " in event and (database + "_db ") in event for event in events), 2)

    def test_directory_disguised_as_dump_does_not_touch_any_database(self):
        for database in self.databases:
            (self.backup / (database + ".sql")).write_text("SELECT 1;\n")
        disguised = self.backup / "catalog.sql"
        disguised.unlink()
        disguised.mkdir()
        self.assertNotEqual(self.run_restore().returncode, 0)
        self.assertFalse(self.events.exists())


if __name__ == "__main__":
    unittest.main()
