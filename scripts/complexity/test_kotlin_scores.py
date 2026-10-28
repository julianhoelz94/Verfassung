"""Regression tests for the Kotlin complexity score ratchet."""

from contextlib import redirect_stderr, redirect_stdout
from io import StringIO
import json
from pathlib import Path
import tempfile
import unittest

from kotlin_scores import findings, main, make_baseline, violations


def xml(score=21, function="example", path="services/example/src/main/kotlin/Example.kt", source="detekt.CognitiveComplexMethod"):
    return f'''<checkstyle><file name="{path}"><error source="{source}" message="The function {function} appears to be too complex based on Cognitive Complexity (complexity: {score})." /></file></checkstyle>'''


def file_xml(score=101, maximum=100, path="services/example/src/main/kotlin/Example.kt"):
    return f'''<checkstyle><file name="{path}"><error source="detekt.CognitiveComplexFile" message="The file has cognitive complexity {score}; maximum is {maximum}." /></file></checkstyle>'''


def combine(*documents):
    return '<checkstyle>' + ''.join(
        document.removeprefix('<checkstyle>').removesuffix('</checkstyle>')
        for document in documents
    ) + '</checkstyle>'


class KotlinScoreTest(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.report = Path(self.directory.name) / "all.xml"
        self.baseline = Path(self.directory.name) / "scores.json"

    def read(self, content):
        self.report.write_text(content)
        return findings(self.report)

    def test_unchanged_reduced_and_removed_findings_pass(self):
        original = self.read(xml(30))
        baseline = make_baseline(original)
        self.assertEqual(violations(original, baseline), [])
        self.assertEqual(violations(self.read(xml(21)), baseline), [])
        self.assertEqual(violations(self.read(xml(20)), baseline), [])
        self.assertEqual(violations({}, baseline), [])

    def test_existing_function_body_score_increase_fails(self):
        baseline = make_baseline(self.read(xml(30)))
        errors = violations(self.read(xml(31)), baseline)
        self.assertEqual(len(errors), 1)
        self.assertIn("31 exceeds reviewed maximum 30", errors[0])

    def test_new_function_or_file_above_limit_fails(self):
        baseline = make_baseline(self.read(xml(30)))
        for content in [xml(21, function="new"), xml(21, path="services/other/Example.kt")]:
            with self.subTest(content=content):
                self.assertIn("exceeds reviewed maximum 20", violations(self.read(content), baseline)[0])

    def test_line_shifts_do_not_change_identity(self):
        first = self.read(xml(30))
        shifted = self.read(xml(30).replace('<error ', '<error line="100" '))
        self.assertEqual(first, shifted)

    def test_unrecognized_findings_and_ambiguous_overloads_fail_closed(self):
        duplicate = xml().replace('</file>', '<error source="detekt.CognitiveComplexMethod" message="The function example appears to be too complex (complexity: 22)." /></file>')
        for content in ['<html>error</html>', xml(source="other"), xml().replace("The function", "Unknown"), duplicate,
                        xml(path="/outside/Example.kt"), xml(path="../Example.kt")]:
            with self.subTest(content=content), self.assertRaises(ValueError):
                self.read(content)

    def test_invalid_baseline_rejected(self):
        original = make_baseline(self.read(xml()))
        for baseline in [{**original, "version": 1}, {**original, "limit": 15},
                         {**original, "entries": original["entries"] * 2},
                         {**original, "entries": [{**original["entries"][0], "score": 20}]}]:
            with self.subTest(baseline=baseline), self.assertRaises(ValueError):
                violations({}, baseline)

    def test_file_budget_allows_100_but_rejects_101_without_an_exception(self):
        baseline = make_baseline({})
        self.assertEqual(violations(self.read(file_xml(100)), baseline), [])
        errors = violations(self.read(file_xml(101)), baseline)
        self.assertEqual(len(errors), 1)
        self.assertIn("file: cognitive complexity 101 exceeds reviewed maximum 100", errors[0])

    def test_file_exception_accepts_unchanged_reduced_and_removed_scores(self):
        original = self.read(file_xml(179))
        baseline = make_baseline(original)
        self.assertEqual(baseline["file_entries"], [{
            "path": "services/example/src/main/kotlin/Example.kt", "score": 179,
        }])
        self.assertEqual(baseline["entries"], [])
        self.assertEqual(violations(original, baseline), [])
        self.assertEqual(violations(self.read(file_xml(178)), baseline), [])
        self.assertEqual(violations(self.read(file_xml(100)), baseline), [])
        self.assertEqual(violations({}, baseline), [])

    def test_file_body_increase_fails_even_while_native_exception_remains(self):
        baseline = make_baseline(self.read(file_xml(179)))
        errors = violations(self.read(file_xml(180)), baseline)
        self.assertEqual(len(errors), 1)
        self.assertIn("file: cognitive complexity 180 exceeds reviewed maximum 179", errors[0])

    def test_file_exception_identity_uses_the_whole_relative_path(self):
        baseline = make_baseline(self.read(file_xml(179)))
        self.assertIn("exceeds reviewed maximum 100", violations(
            self.read(file_xml(101, path="services/other/src/main/kotlin/Example.kt")), baseline,
        )[0])

    def test_method_and_file_scores_do_not_share_an_exception(self):
        content = combine(xml(30), file_xml(179))
        scores = self.read(content)
        baseline = make_baseline(scores)
        self.assertEqual(len(baseline["entries"]), 1)
        self.assertEqual(len(baseline["file_entries"]), 1)
        self.assertEqual(violations(scores, baseline), [])
        method_only = {**baseline, "file_entries": []}
        self.assertEqual(len(violations(scores, method_only)), 1)
        self.assertIn("file:", violations(scores, method_only)[0])

    def test_invalid_file_metadata_duplicates_and_unknown_file_messages_fail_closed(self):
        baseline = make_baseline(self.read(file_xml()))
        for changed in [{**baseline, "file_limit": 99},
                        {**baseline, "file_entries": baseline["file_entries"] * 2},
                        {**baseline, "file_entries": [{**baseline["file_entries"][0], "score": 100}]},
                        {**baseline, "file_entries": [{**baseline["file_entries"][0], "score": True}]}]:
            with self.subTest(baseline=changed), self.assertRaises(ValueError):
                violations({}, changed)
        for content in [file_xml(maximum=99), file_xml().replace("The file has", "File has")]:
            with self.subTest(content=content), self.assertRaises(ValueError):
                self.read(content)
        with self.assertRaises(ValueError):
            self.read(combine(file_xml(), file_xml()))

    def test_cli_baseline_generation_pass_failure_and_read_only_check(self):
        self.report.write_text(xml(30))
        args = ["--report", str(self.report), "--baseline-file", str(self.baseline)]
        with redirect_stdout(StringIO()), redirect_stderr(StringIO()):
            self.assertEqual(main([*args, "--baseline"]), 0)
            original = self.baseline.read_bytes()
            self.assertEqual(json.loads(original)["limit"], 20)
            self.assertEqual(json.loads(original)["file_limit"], 100)
            self.assertEqual(main(args), 0)
            self.report.write_text(xml(31))
            self.assertEqual(main(args), 1)
            self.assertEqual(self.baseline.read_bytes(), original)

    def test_cli_records_file_scores_then_rejects_an_increase_without_rewriting_baseline(self):
        self.report.write_text(file_xml(179))
        args = ["--report", str(self.report), "--baseline-file", str(self.baseline)]
        with redirect_stdout(StringIO()), redirect_stderr(StringIO()):
            self.assertEqual(main([*args, "--baseline"]), 0)
            original = self.baseline.read_bytes()
            self.assertEqual(json.loads(original)["version"], 2)
            self.report.write_text(file_xml(180))
            self.assertEqual(main(args), 1)
            self.assertEqual(self.baseline.read_bytes(), original)


if __name__ == "__main__":
    unittest.main()
