#!/usr/bin/env python3
"""Reject generated artifacts and exact Kotlin implementation copies in tracked source.

This is a narrow regression guard, not a semantic clone detector. Separate service
DTOs, migrations, contract fixtures and intentional test setup are not consolidated.
"""
from collections import defaultdict
from pathlib import Path
import subprocess
import sys


def main():
    root = Path(__file__).resolve().parents[1]
    files = subprocess.check_output(
        ["git", "ls-files", "-z", "--cached", "--others", "--exclude-standard"], cwd=root,
    ).decode().split("\0")
    copies = defaultdict(list)
    errors = []
    for name in sorted(set(files)):
        path = root / name
        if not name or not path.is_file():
            continue
        if (path.suffix in {".bundle", ".tsbuildinfo", ".pyc"}
                or path.name == ".DS_Store"
                or any(part in {"node_modules", ".next", ".gradle", "__pycache__"} for part in path.relative_to(root).parts)
                or name.startswith("docs/wiki/media/")):
            errors.append("Generated/local artifact must not be tracked: " + name)
        if path.suffix != ".kt" or "/src/main/" not in name:
            continue
        implementation = "\n".join(
            line.strip() for line in path.read_text().splitlines()
            if line.strip() and not line.strip().startswith(("package ", "import ", "//", "/*", "*"))
        )
        if len(implementation) > 300:
            copies[implementation].append(name)
    for names in copies.values():
        if len(names) > 1:
            errors.append("Duplicate Kotlin implementation; review shared ownership: " + ", ".join(names))
    if errors:
        print("\n".join(errors), file=sys.stderr)
        return 1
    print("Repository hygiene: no generated artifacts or exact Kotlin implementation copies.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
