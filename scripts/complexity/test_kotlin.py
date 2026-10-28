"""Exercise the real Kotlin CI gate with temporary sources; requires Java 21."""

from pathlib import Path
import subprocess
import tempfile
import unittest
import xml.etree.ElementTree as ET


ROOT = Path(__file__).resolve().parents[2]


def function_with_score(name, score):
    branches = [f"    if (value == {index}) result++" for index in range(score)]
    return "\n".join([
        f"fun {name}(value: Int): Int {{",
        "    var result = 0",
        *branches,
        "    return result",
        "}",
    ])


class KotlinComplexityGateTest(unittest.TestCase):
    def test_existing_baseline_and_new_function_boundary(self):
        baseline = ROOT / "config/detekt/cognitive-complexity-baseline.xml"
        original_baseline = baseline.read_bytes()
        report = ROOT / "build/reports/complexity/kotlin/detekt.xml"
        report.unlink(missing_ok=True)

        # Use a real source directory so this also verifies CI's inclusion of
        # platform/test Kotlin. TemporaryDirectory cleans up even on failure.
        with tempfile.TemporaryDirectory(
            prefix="complexity-probe-",
            dir=ROOT / "services/platform/src/test/kotlin",
        ) as directory:
            probe = Path(directory) / "CognitiveComplexityGateProbe.kt"
            probe.write_text(
                function_with_score("complexityAtLimit", 15)
                + "\n\n"
                + function_with_score("complexityOverLimit", 16)
                + "\n",
                encoding="utf-8",
            )
            run = subprocess.run(
                [str(ROOT / "gradlew"), "cognitiveComplexity", "--no-daemon"],
                cwd=ROOT,
                text=True,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                timeout=300,
                check=False,
            )
            self.assertNotEqual(run.returncode, 0, run.stdout)
            self.assertTrue(report.is_file(), run.stdout)
            findings = ET.parse(report).findall(".//error")
            self.assertEqual(len(findings), 1, run.stdout)
            finding = findings[0]
            self.assertEqual(finding.get("source"), "detekt.CognitiveComplexMethod")
            self.assertIn("complexityOverLimit", finding.get("message"))
            self.assertIn("complexity: 16", finding.get("message"))
            self.assertEqual(baseline.read_bytes(), original_baseline)


if __name__ == "__main__":
    unittest.main()
