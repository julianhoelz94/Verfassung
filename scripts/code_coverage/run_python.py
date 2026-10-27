#!/usr/bin/env python3
"""Run existing Python checks with coverage, including previously unimported files."""
from pathlib import Path
import subprocess
import sys


ROOT = Path(__file__).resolve().parents[2]
CHECKS = [
    ['scripts/test_local_stack.py'],
    ['scripts/test_backup_restore.py'],
    ['scripts/check-repository-hygiene.py'],
    ['scripts/check-wiki-docs.py'],
    ['-m', 'unittest', 'discover', '-s', 'scripts/cd', '-p', 'test_*.py'],
    ['-m', 'unittest', 'discover', '-s', 'scripts/operations', '-p', 'test_*.py'],
    ['-m', 'unittest', 'discover', '-s', 'scripts/code_coverage', '-p', 'test_*.py'],
    ['-m', 'unittest', 'discover', '-s', 'infra/caddy', '-p', 'test_*.py'],
]


def main():
    failed = False
    for arguments in CHECKS:
        result = subprocess.run([sys.executable, '-m', 'coverage', 'run', '--parallel-mode', *arguments], cwd=ROOT)
        failed = failed or result.returncode != 0
    return int(failed)


if __name__ == '__main__':
    raise SystemExit(main())
