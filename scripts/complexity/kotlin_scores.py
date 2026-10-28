"""Reject method and file complexity increases hidden by detekt baselines."""

import argparse
import json
from pathlib import Path
import re
import sys
import xml.etree.ElementTree as ET


ROOT = Path(__file__).resolve().parents[2]
LIMIT = 20
FILE_LIMIT = 100
REPORT = ROOT / "build/reports/complexity/kotlin/all.xml"
BASELINE = ROOT / "config/detekt/cognitive-complexity-scores.json"
MESSAGE = re.compile(r"The function (\S+) appears.*\(complexity: (\d+)\)")
FILE_MESSAGE = re.compile(r"The file has cognitive complexity (\d+); maximum is (\d+)\.")


def parse_finding(path, error):
    """Distinguish supported rule messages; never treat unknown findings as clean."""
    source = error.get("source")
    if source == "detekt.CognitiveComplexMethod":
        match = MESSAGE.match(error.attrib["message"])
        if match:
            function, value = match.groups()
            return (path, function), int(value), LIMIT
    if source == "detekt.CognitiveComplexFile":
        match = FILE_MESSAGE.fullmatch(error.attrib["message"])
        if match:
            value, maximum = map(int, match.groups())
            if maximum != FILE_LIMIT:
                raise ValueError("Detekt file limit does not match the score policy")
            return (path,), value, FILE_LIMIT
    raise ValueError("Unrecognized detekt finding: " + str(error.attrib))


def findings(report):
    """Read stable file and file/function identities; ambiguous findings fail closed."""
    scores = {}
    document = ET.parse(report).getroot()
    if document.tag != "checkstyle":
        raise ValueError("Expected a detekt checkstyle report")
    for file in document.findall("file"):
        path = file.attrib["name"]
        if Path(path).is_absolute() or ".." in Path(path).parts:
            raise ValueError("Expected repository-relative detekt path: " + path)
        for error in file.findall("error"):
            key, score, limit = parse_finding(path, error)
            if score <= limit:
                continue
            if key in scores:
                raise ValueError("Duplicate or ambiguous Kotlin finding: " + str(key))
            scores[key] = score
    return scores


def make_baseline(scores):
    """Record reviewed maximum scores without depending on source line numbers."""
    return {
        "version": 2,
        "limit": LIMIT,
        "file_limit": FILE_LIMIT,
        "entries": [
            {"path": key[0], "function": key[1], "score": score}
            for key, score in sorted(scores.items()) if len(key) == 2
        ],
        "file_entries": [
            {"path": key[0], "score": score}
            for key, score in sorted(scores.items()) if len(key) == 1
        ],
    }


def violations(scores, baseline):
    """Accept unchanged or reduced debt, rejecting new or increased scores."""
    if (baseline.get("version") != 2 or baseline.get("limit") != LIMIT
            or baseline.get("file_limit") != FILE_LIMIT):
        raise ValueError("Invalid Kotlin score baseline version or limit")
    accepted = {}
    for entries, limit in [(baseline["entries"], LIMIT), (baseline["file_entries"], FILE_LIMIT)]:
        for entry in entries:
            key = (entry["path"], entry["function"]) if limit == LIMIT else (entry["path"],)
            score = entry["score"]
            if key in accepted or type(score) is not int or score <= limit:
                raise ValueError("Invalid or duplicate Kotlin score baseline entry")
            accepted[key] = score
    errors = []
    for key, score in sorted(scores.items()):
        limit = LIMIT if len(key) == 2 else FILE_LIMIT
        maximum = accepted.get(key, limit)
        if score > maximum:
            label = key[1] if len(key) == 2 else "file"
            errors.append(f"{key[0]} {label}: cognitive complexity {score} exceeds reviewed maximum {maximum}")
    return errors


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--report", type=Path, default=REPORT)
    parser.add_argument("--baseline-file", type=Path, default=BASELINE)
    parser.add_argument("--baseline", action="store_true", help="Explicitly record reviewed scores; never run in CI")
    args = parser.parse_args(argv)
    scores = findings(args.report)
    if args.baseline:
        args.baseline_file.write_text(json.dumps(make_baseline(scores), indent=2) + "\n")
    errors = violations(scores, json.loads(args.baseline_file.read_text()))
    for error in errors:
        print(error, file=sys.stderr)
    methods = sum(len(key) == 2 for key in scores)
    files = len(scores) - methods
    print(f"Kotlin score ratchet: {methods} over-limit functions; {files} over-limit files; {len(errors)} new or increased scores.")
    return int(bool(errors))


if __name__ == "__main__":
    try:
        sys.exit(main())
    except (OSError, ValueError, KeyError, ET.ParseError) as error:
        print(str(error), file=sys.stderr)
        sys.exit(1)
