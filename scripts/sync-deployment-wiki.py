#!/usr/bin/env python3
"""Publish the canonical deployment guides as complete, reproducible Wiki pages."""

import argparse
from pathlib import Path
import re
from urllib.parse import quote, unquote, urlsplit, urlunsplit


ROOT = Path(__file__).resolve().parents[1]
REPOSITORY = "https://github.com/julianhoelz94/Verfassung/blob/main/"
GUIDES = {
    "docs/coolify-server-setup.md": "Coolify-Server-Setup",
    "docs/manual-deployment.md": "Manual-Deployment",
}
LINK = re.compile(r"(\[[^\]\n]+\]\()([^\s)]+)(\))")
FENCE = re.compile(r"^\s{0,3}(`{3,}|~{3,})")


def wiki_link(target, source, root):
    parsed = urlsplit(target)
    if parsed.scheme or parsed.netloc or not parsed.path:
        return target
    destination = (source.parent / unquote(parsed.path)).resolve()
    relative = destination.relative_to(root).as_posix()
    if not destination.exists():
        raise ValueError(f"{source.relative_to(root)}: missing link target {target}")
    path = GUIDES.get(relative, REPOSITORY + quote(relative, safe="/"))
    return urlunsplit(("", "", path, parsed.query, parsed.fragment))


def render(source, root=ROOT):
    source = Path(source)
    root = Path(root).resolve()
    lines = []
    fence = None
    for line in source.read_text().splitlines(keepends=True):
        match = FENCE.match(line)
        if match:
            marker = match.group(1)
            if fence is None:
                fence = marker
            elif marker[0] == fence[0] and len(marker) >= len(fence) and not line[match.end():].strip():
                fence = None
            lines.append(line)
        elif fence is not None:
            lines.append(line)
        else:
            lines.append(LINK.sub(lambda link: link[1] + wiki_link(link[2], source, root) + link[3], line))
    header = (
        f"<!-- Generated from {source.relative_to(root).as_posix()} by scripts/sync-deployment-wiki.py.\n"
        "Edit the source guide and run: python3 scripts/sync-deployment-wiki.py -->\n\n"
    )
    return header + "".join(lines)


def sync(check=False, root=ROOT):
    root = Path(root).resolve()
    stale = []
    for source, page in GUIDES.items():
        destination = root / "docs/wiki" / (page + ".md")
        expected = render(root / source, root)
        if check:
            if not destination.is_file() or destination.read_text() != expected:
                stale.append(destination.relative_to(root).as_posix())
        else:
            destination.write_text(expected)
    if stale:
        raise SystemExit("Deployment Wiki pages are stale: " + ", ".join(stale)
                         + ". Run: python3 scripts/sync-deployment-wiki.py")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="Reject missing or outdated generated pages")
    args = parser.parse_args()
    sync(check=args.check)
    print("Checked deployment Wiki pages." if args.check else "Updated deployment Wiki pages.")
