"""Exercise the real file-complexity gate with small methods and nested declarations."""

from pathlib import Path
import subprocess
import tempfile
import unittest
import xml.etree.ElementTree as ET


ROOT = Path(__file__).resolve().parents[2]


def function(name, score):
    branches = "\n".join(f"    if (value == {index}) result++" for index in range(score))
    return f"fun {name}(value: Int): Int {{\n    var result = 0\n{branches}\n    return result\n}}\n"


class KotlinFileComplexityGateTest(unittest.TestCase):
    def test_file_budget_counts_all_helpers_and_counts_nested_functions_once(self):
        baselines = [
            ROOT / "config/detekt/cognitive-complexity-baseline.xml",
            ROOT / "config/detekt/cognitive-complexity-scores.json",
        ]
        originals = [path.read_bytes() for path in baselines]
        report = ROOT / "build/reports/complexity/kotlin/detekt.xml"
        report.unlink(missing_ok=True)

        with tempfile.TemporaryDirectory(
            prefix="file-complexity-probe-",
            dir=ROOT / "services/platform/src/test/kotlin",
        ) as directory:
            files = Path(directory)
            at_limit = "\n".join(function(f"helper{index}", 20) for index in range(5))
            (files / "AtLimit.kt").write_text("package probe.atlimit\n" + at_limit)
            (files / "AboveLimit.kt").write_text(
                "package probe.above\n" + at_limit + function("last", 1),
            )
            (files / "SplitHelpers.kt").write_text(
                "package probe.split\nfun orchestration(value: Int) = helper0(value)\n"
                + at_limit + function("last", 1),
            )
            # The local function's branch costs two inside its outer function.
            # Counting that local function again would incorrectly raise 100 to 101.
            (files / "NestedAtLimit.kt").write_text(
                "package probe.nested\n"
                + "\n".join(function(f"helper{index}", 20) for index in range(4))
                + function("helperLast", 18)
                + "fun outer(value: Boolean) { fun local() { if (value) println(value) }; local() }\n",
            )
            # Omitting the nested body would incorrectly let this 101-score file pass.
            (files / "NestedAboveLimit.kt").write_text(
                "package probe.nestedabove\n"
                + "\n".join(function(f"helper{index}", 20) for index in range(4))
                + function("helperLast", 19)
                + "fun outer(value: Boolean) { fun local() { if (value) println(value) }; local() }\n",
            )
            (files / "ClassesAndObjects.kt").write_text(
                "package probe.members\nclass First {\n" + function("first", 20) + "}\n"
                + "object Second {\n" + function("second", 20) + "}\n"
                + "class Third { companion object {\n" + function("third", 20) + "} }\n"
                + function("fourth", 20) + function("fifth", 20) + function("last", 1),
            )
            run = subprocess.run(
                [str(ROOT / "gradlew"), "cognitiveComplexity", "--no-daemon"],
                cwd=ROOT, text=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                timeout=300, check=False,
            )
            self.assertNotEqual(run.returncode, 0, run.stdout)
            self.assertTrue(report.is_file(), run.stdout)
            findings = ET.parse(report).findall("file")
            actual = {}
            for file in findings:
                for error in file.findall("error"):
                    self.assertEqual(error.get("source"), "detekt.CognitiveComplexFile", run.stdout)
                    self.assertEqual(
                        error.get("message"),
                        "The file has cognitive complexity 101; maximum is 100.",
                        run.stdout,
                    )
                    actual[Path(file.get("name")).name] = error.get("source")
            self.assertEqual(
                set(actual),
                {"AboveLimit.kt", "SplitHelpers.kt", "ClassesAndObjects.kt", "NestedAboveLimit.kt"},
                run.stdout,
            )
            self.assertEqual([path.read_bytes() for path in baselines], originals)


if __name__ == "__main__":
    unittest.main()
