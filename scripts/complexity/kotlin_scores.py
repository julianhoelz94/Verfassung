"""Reject increases hidden by detekt's signature-based Kotlin baseline."""

import argparse
import json
from pathlib import Path
import re
import sys
import xml.etree.ElementTree as ET


ROOT = Path(__file__).resolve().parents[2]
LIMIT = 20
REPORT = ROOT / "build/reports/complexity/kotlin/all.xml"
BASELINE = ROOT / "config/detekt/cognitive-complexity-scores.json"
MESSAGE = re.compile(r"The function (\S+) appears.*\(complexity: (\d+)\)")


def findings(report):
    """Read unique file/function scores; ambiguous overloads fail closed."""
    scores = {}
    document = ET.parse(report).getroot()
    if document.tag != "checkstyle":
        raise ValueError("Expected a detekt checkstyle report")
    for file in document.findall("file"):
        path = file.attrib["name"]
        if Path(path).is_absolute() or ".." in Path(path).parts:
            raise ValueError("Expected repository-relative detekt path: " + path)
        for error in file.findall("error"):
            match = MESSAGE.match(error.attrib["message"])
            if error.get("source") != "detekt.CognitiveComplexMethod" or match is None:
                raise ValueError("Unrecognized detekt finding: " + str(error.attrib))
            function, value = match.groups()
            score = int(value)
            if score <= LIMIT:
                continue
            key = (path, function)
            if key in scores:
                raise ValueError("Ambiguous overloaded Kotlin finding: " + str(key))
            scores[key] = score
    return scores


def make_baseline(scores):
    """Record reviewed maximum scores without depending on source line numbers."""
    return {
        "version": 1,
        "limit": LIMIT,
        "entries": [
            {"path": path, "function": function, "score": score}
            for (path, function), score in sorted(scores.items())
        ],
    }


def violations(scores, baseline):
    """Accept unchanged or reduced debt, rejecting new or increased scores."""
    if baseline.get("version") != 1 or baseline.get("limit") != LIMIT:
        raise ValueError("Invalid Kotlin score baseline version or limit")
    accepted = {}
    for entry in baseline["entries"]:
        key = (entry["path"], entry["function"])
        score = entry["score"]
        if key in accepted or type(score) is not int or score <= LIMIT:
            raise ValueError("Invalid or duplicate Kotlin score baseline entry")
        accepted[key] = score
    return [
        f"{path} {function}: cognitive complexity {score} exceeds reviewed maximum {accepted.get((path, function), LIMIT)}"
        for (path, function), score in sorted(scores.items())
        if score > accepted.get((path, function), LIMIT)
    ]


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
    print(f"Kotlin score ratchet: {len(scores)} over-limit functions; {len(errors)} new or increased scores.")
    return int(bool(errors))


if __name__ == "__main__":
    try:
        sys.exit(main())
    except (OSError, ValueError, KeyError, ET.ParseError) as error:
        print(str(error), file=sys.stderr)
        sys.exit(1)
