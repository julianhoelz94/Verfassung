import contextlib
from decimal import Decimal
import io
import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch

import coverage_report as cr
import run_python


class CoverageTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.env = patch.dict(os.environ, {'GITHUB_RUN_ID': '123', 'GITHUB_RUN_ATTEMPT': '2'})
        self.env.start()
        self.addCleanup(self.env.stop)
        self.git('init', '-q')
        self.source = {
            'services/example/build.gradle.kts': '// build\n',
            'services/example/src/main/kotlin/demo/Example.kt': 'package demo\nclass Example {\n fun answer() = 42\n}\n',
            'apps/gateway-web/lib/example.ts': 'export const first = 1;\nexport const second = 2;\n',
            'apps/gateway-web/lib/example.js': 'module.exports = 42;\n',
            'services/mcp-server/src/example.ts': 'export const answer = 42;\n',
            'scripts/helper.py': 'def answer():\n    return 42\n',
        }
        for name, text in self.source.items():
            self.write(name, text)
        self.commit()
        self.base = cr.git(self.root, 'rev-parse', 'HEAD')

    def git(self, *args):
        return subprocess.check_output(['git', *args], cwd=self.root, stderr=subprocess.PIPE).decode().strip()

    def commit(self):
        self.git('add', '.')
        self.git('-c', 'user.name=Coverage test', '-c', 'user.email=coverage@example.invalid', 'commit', '-qm', 'test')

    def write(self, path, text):
        target = self.root / path
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(text)
        return target

    def istanbul(self, source, hits=(1, 0)):
        return {source: {'path': str(self.root / source),
                         'statementMap': {str(i): {'start': {'line': i + 1, 'column': 0},
                                                  'end': {'line': i + 1, 'column': 20}}
                                          for i in range(len(hits))},
                         's': {str(i): hit for i, hit in enumerate(hits)},
                         'branchMap': {'0': {'type': 'if', 'line': 1, 'locations': [
                             {'start': {'line': 1, 'column': 0}, 'end': {'line': 1, 'column': 2}},
                             {'start': {'line': 1, 'column': 3}, 'end': {'line': 1, 'column': 4}}]}},
                         'b': {'0': [1, 0]}}}

    def inputs(self):
        groups = cr.inventory(self.root)
        for component, sources in groups.items():
            destination = self.root / 'coverage/inputs' / component
            destination.mkdir(parents=True)
            if component.startswith('jvm-'):
                self.write(f'coverage/inputs/{component}/test.exec', 'binary test probes')
            else:
                cr.write_json(destination / 'coverage.json', {
                    name: {'lines': {'1': True}, 'branches': {}} for name in sources})
            metadata = cr.provenance(self.root, component, sources)
            metadata['payload'] = {p.relative_to(destination).as_posix(): cr.digest(p)
                                   for p in destination.iterdir() if p.is_file()}
            cr.write_json(destination / 'metadata.json', metadata)
        self.write('coverage/jvm.xml', '''<report><package name="demo"><sourcefile name="Example.kt">
          <line nr="3" mi="0" ci="2" mb="1" cb="1"/>
        </sourcefile></package></report>''')
        return groups

    def test_inventory_is_independent_of_imported_files_and_excludes_tests_and_declarations(self):
        for name in ('apps/gateway-web/lib/types.d.ts', 'apps/gateway-web/lib/a.test.ts',
                     'services/example/src/test/kotlin/demo/Test.kt', 'scripts/test_helper.py',
                     'scripts/test-helper.py', 'services/mcp-server/dist/generated.js'):
            self.write(name, 'uncovered test or generated output\n')
        self.commit()
        groups = cr.inventory(self.root)
        self.assertEqual(sum(map(len, groups.values())), 5)
        self.assertEqual(len(groups['gateway-typescript']), 1)
        self.assertIn('scripts/helper.py', groups['python'])
        self.assertNotIn('services/mcp-server/dist/generated.js', {p for files in groups.values() for p in files})

    def test_paths_normalize_to_original_checkout_and_reject_escape(self):
        path = 'apps/gateway-web/lib/example.ts'
        self.assertEqual(cr.canonical(self.root, str(self.root / path)), path)
        self.assertEqual(cr.canonical(self.root, path), path)
        for name in ('../secret.ts', '/unrelated/source.ts'):
            with self.assertRaisesRegex(ValueError, 'outside checkout'):
                cr.canonical(self.root, name)

    def test_python_dunder_modules_remain_in_production_inventory(self):
        for name in ('scripts/cd/__init__.py', 'scripts/cd/__main__.py'):
            self.write(name, 'print("production module")\n')
        self.write('scripts/__pycache__/generated.py', 'cache only\n')
        self.commit()
        names = cr.inventory(self.root)['python']
        self.assertIn('scripts/cd/__init__.py', names)
        self.assertIn('scripts/cd/__main__.py', names)
        self.assertNotIn('scripts/__pycache__/generated.py', names)

    def test_jsx_cannot_escape_inventory_or_collector_completeness(self):
        name = 'apps/gateway-web/app/components/Untested.jsx'
        self.write(name, 'export default function Untested() { return <p>Untested</p>; }\n')
        self.commit()
        self.assertIn(name, cr.inventory(self.root)['gateway-typescript'])
        raw = self.write('raw.json', json.dumps(self.istanbul('apps/gateway-web/lib/example.ts')))
        with self.assertRaisesRegex(ValueError, 'omitted production sources.*Untested.jsx'):
            cr.pack(self.root, 'gateway-typescript', 'istanbul', raw)

    def test_unsupported_application_source_extensions_fail_closed(self):
        for name in ('services/example/src/main/java/demo/Example.java',
                     'apps/gateway-web/lib/example.mts', 'services/mcp-server/src/extra.mjs'):
            self.write(name, 'new source\n')
            self.commit()
            with self.assertRaisesRegex(ValueError, 'Unsupported production source'):
                cr.inventory(self.root)
            (self.root / name).unlink()
            self.commit()

    def test_overlapping_observations_count_each_line_and_branch_once(self):
        target = {}
        first = {'original.ts': {'lines': {'1': True, '2': False}, 'branches': {'a': False, 'b': True}}}
        second = {'original.ts': {'lines': {'1': True, '2': True, '3': False}, 'branches': {'a': True, 'b': False}}}
        cr.merge_files(target, first)
        cr.merge_files(target, second)
        cr.merge_files(target, second)
        self.assertEqual(cr.metrics(target['original.ts']['lines'].values()), {'covered': 2, 'total': 3, 'percent': 66.67})
        self.assertEqual(cr.metrics(target['original.ts']['branches'].values())['total'], 2)
        self.assertTrue(all(target['original.ts']['branches'].values()))
        with self.assertRaisesRegex(ValueError, 'Invalid coverage flag'):
            cr.merge_files({}, {'a': {'lines': {'1': 1}, 'branches': {}}})

    def test_istanbul_counts_statement_source_lines_once(self):
        source = 'apps/gateway-web/lib/example.ts'
        value = self.istanbul(source)
        value[source]['statementMap']['1']['start']['line'] = 1
        value[source]['b']['0'] = [0, 1]
        path = self.write('raw.json', json.dumps(value))
        parsed = cr.istanbul(self.root, path)[source]
        self.assertEqual(parsed['lines'], {'1': True})
        self.assertEqual(cr.metrics(parsed['branches'].values())['covered'], 1)

    def test_python_lines_and_branch_arcs_include_unexecuted_code(self):
        path = self.write('raw.json', json.dumps({'files': {'scripts/helper.py': {
            'executed_lines': [1], 'missing_lines': [2],
            'executed_branches': [[1, 2]], 'missing_branches': [[1, -1]]}}}))
        parsed = cr.python_coverage(self.root, path)['scripts/helper.py']
        self.assertEqual(parsed['lines'], {'1': True, '2': False})
        self.assertEqual(cr.metrics(parsed['branches'].values())['total'], 2)

    def test_jvm_merged_report_resolves_owner_and_includes_missed_lines(self):
        groups = self.inputs()
        path = self.root / 'coverage/jvm.xml'
        path.write_text(path.read_text().replace('</sourcefile>', '<line nr="2" ci="0" mi="3" cb="0" mb="0"/></sourcefile>'))
        parsed = cr.jacoco(self.root, path, groups)
        data = parsed['services/example/src/main/kotlin/demo/Example.kt']
        self.assertEqual(data['lines'], {'3': True, '2': False})
        self.assertEqual(cr.metrics(data['branches'].values())['total'], 2)
        path.write_text('<report/>')
        with self.assertRaisesRegex(ValueError, 'omitted executable component'):
            cr.jacoco(self.root, path, groups)

    def test_jvm_rejects_unknown_and_ambiguous_source_identity(self):
        groups = self.inputs()
        path = self.root / 'coverage/jvm.xml'
        path.write_text('<report><package name="unknown"><sourcefile name="X.kt"><line nr="1" ci="1" mi="0" cb="0" mb="0"/></sourcefile></package></report>')
        with self.assertRaisesRegex(ValueError, 'Unknown JVM source'):
            cr.jacoco(self.root, path, groups)

        name = 'services/other/src/main/kotlin/demo/Example.kt'
        self.write(name, self.source['services/example/src/main/kotlin/demo/Example.kt'])
        groups['jvm-other'] = {name: 'hash'}
        with self.assertRaisesRegex(ValueError, 'Ambiguous JVM'):
            cr.jacoco(self.root, path, groups)

    def test_jvm_missing_file_cannot_disappear_from_new_code_denominator(self):
        groups = self.inputs()
        name = 'services/example/src/main/kotlin/demo/Uncovered.kt'
        self.write(name, 'package demo\nfun untested() = 42\n')
        groups['jvm-example'][name] = cr.digest(self.root / name)
        with self.assertRaisesRegex(ValueError, 'omitted production sources.*Uncovered.kt'):
            cr.jacoco(self.root, self.root / 'coverage/jvm.xml', groups)
        path = self.root / 'coverage/jvm.xml'
        path.write_text(path.read_text().replace('</package>', '<sourcefile name="Uncovered.kt"/></package>'))
        self.assertEqual(cr.jacoco(self.root, path, groups)[name]['lines'], {})

    def test_empty_kotlin_inline_library_placeholders_do_not_enter_denominator(self):
        groups = self.inputs()
        path = self.root / 'coverage/jvm.xml'
        expected = cr.jacoco(self.root, path, groups)
        path.write_text(path.read_text().replace('</package>', '<sourcefile name="Comparisons.kt"/></package>'))
        self.assertEqual(cr.jacoco(self.root, path, groups), expected)

    def test_pack_normalizes_istanbul_and_rejects_missing_sources(self):
        source = 'apps/gateway-web/lib/example.ts'
        raw = self.write('raw.json', json.dumps(self.istanbul(source)))
        destination = cr.pack(self.root, 'gateway-typescript', 'istanbul', raw)
        self.assertEqual(set(json.loads((destination / 'coverage.json').read_text())), {source})
        self.assertEqual(json.loads((destination / 'metadata.json').read_text())['run_id'], '123')
        cr.pack(self.root, 'gateway-typescript', 'istanbul', raw)  # replaces earlier output
        raw.write_text('{}')
        with self.assertRaisesRegex(ValueError, 'omitted production sources'):
            cr.pack(self.root, 'gateway-typescript', 'istanbul', raw)
        with self.assertRaisesRegex(ValueError, 'Unknown or empty'):
            cr.pack(self.root, 'absent', 'istanbul', raw)

    def test_pack_python_and_jvm_requires_exec_and_compiled_classes(self):
        raw = self.write('raw.json', json.dumps({'files': {'scripts/helper.py': {
            'executed_lines': [1], 'missing_lines': [2]}}}))
        cr.pack(self.root, 'python', 'python', raw)
        with self.assertRaisesRegex(ValueError, 'Missing JVM execution'):
            cr.pack(self.root, 'jvm-example', 'jvm', None)
        self.write('services/example/build/jacoco/test.exec', 'probes')
        with self.assertRaisesRegex(ValueError, 'Missing JVM production classes'):
            cr.pack(self.root, 'jvm-example', 'jvm', None)
        self.write('services/example/build/classes/kotlin/main/demo/Example.class', 'bytecode')
        result = cr.pack(self.root, 'jvm-example', 'jvm', None)
        self.assertTrue((result / 'classes/demo/Example.class').is_file())

    def test_validate_rejects_missing_components_corrupt_payload_and_stale_revision(self):
        groups = self.inputs()
        cr.validate_inputs(self.root, groups)
        path = self.root / 'coverage/inputs/mcp/coverage.json'
        path.write_text('{}')
        with self.assertRaisesRegex(ValueError, 'corrupted coverage payload'):
            cr.validate_inputs(self.root, groups)
        path.unlink()
        with self.assertRaisesRegex(ValueError, 'corrupted coverage payload'):
            cr.validate_inputs(self.root, groups)
        self.write('coverage/inputs/extra/metadata.json', '{}')
        with self.assertRaisesRegex(ValueError, 'components differ'):
            cr.validate_inputs(self.root, groups)

    def test_validate_binds_source_hash_commit_run_and_attempt(self):
        groups = self.inputs()
        for key, value in [('sha', '0' * 40), ('run_id', '999'), ('run_attempt', '3'), ('sources', {})]:
            path = self.root / 'coverage/inputs/mcp/metadata.json'
            original = json.loads(path.read_text())
            mutated = dict(original, **{key: value})
            cr.write_json(path, mutated)
            with self.assertRaisesRegex(ValueError, 'Stale or incompatible'):
                cr.validate_inputs(self.root, groups)
            cr.write_json(path, original)
        path = self.root / 'coverage/inputs/mcp/metadata.json'
        original = json.loads(path.read_text())
        cr.write_json(path, dict(original, run_attempt='1'))
        cr.validate_inputs(self.root, groups)
        cr.write_json(path, original)
        self.write('services/mcp-server/src/example.ts', 'export const answer = 43;\n')
        with self.assertRaisesRegex(ValueError, 'Stale or incompatible'):
            cr.validate_inputs(self.root, cr.inventory(self.root))

    def test_diff_counts_added_changed_lines_and_excludes_deleted_and_nonproduction(self):
        name = 'apps/gateway-web/lib/example.ts'
        self.write(name, 'export const first = 3;\nexport const second = 2;\nexport const third = 3;\n')
        self.write('docs/readme.md', 'text only\n')
        self.commit()
        result = cr.changed_lines(self.root, self.base, cr.git(self.root, 'rev-parse', 'HEAD'), {name})
        self.assertEqual(result, {name: {1, 3}})
        self.write(name, 'export const first = 3;\n')
        old = cr.git(self.root, 'rev-parse', 'HEAD')
        self.commit()
        self.assertEqual(cr.changed_lines(self.root, old, cr.git(self.root, 'rev-parse', 'HEAD'), {name}), {name: set()})

    def test_main_and_pr_comparison_bases_and_unknown_event(self):
        event = self.write('event.json', json.dumps({'before': self.base}))
        self.assertEqual(cr.comparison_base(self.root, event), self.base)
        event.write_text(json.dumps({'pull_request': {'base': {'sha': self.base}}}))
        self.assertEqual(cr.comparison_base(self.root, event), self.base)
        for value in ({}, {'before': '0' * 40}, {'before': 'main'}):
            event.write_text(json.dumps(value))
            with self.assertRaisesRegex(ValueError, 'no previous revision'):
                cr.comparison_base(self.root, event)

    def test_threshold_uses_unrounded_ratio_and_empty_diff_is_not_applicable(self):
        def result(covered, total):
            files = {'a': {'lines': {str(i): i < covered for i in range(1, total + 1)}, 'branches': {}}}
            return cr.summarize(files, {'group': {'a': 'hash'}}, {'a': set(range(1, total + 1))}, 'head', 'base', Decimal(80))
        self.assertTrue(result(5, 5)['gate_passed'])  # four covered of five
        self.assertFalse(result(4, 5)['gate_passed'])
        below = result(80000, 100000)
        self.assertEqual(below['new_code']['percent'], 80.0)
        self.assertFalse(below['gate_passed'])
        empty = result(0, 0)
        self.assertIsNone(empty['new_code']['percent'])
        self.assertTrue(empty['gate_passed'])
        self.assertIn('N/A', cr.display(empty['new_code']))

    def test_gate_writes_two_statistics_html_source_and_reports_uncovered_changed_line(self):
        name = 'apps/gateway-web/lib/example.ts'
        self.write(name, self.source[name] + 'export const third = "<unsafe>";\n')
        self.commit()
        self.inputs()
        summary = self.root / 'step-summary.md'
        # The normalized collector records the added statement as executable/missed.
        path = self.root / 'coverage/inputs/gateway-typescript/coverage.json'
        data = json.loads(path.read_text())
        data[name]['lines']['3'] = False
        cr.write_json(path, data)
        metadata = self.root / 'coverage/inputs/gateway-typescript/metadata.json'
        value = json.loads(metadata.read_text()); value['payload']['coverage.json'] = cr.digest(path)
        cr.write_json(metadata, value)
        with patch.dict(os.environ, {'GITHUB_STEP_SUMMARY': str(summary)}), contextlib.redirect_stdout(io.StringIO()):
            self.assertEqual(cr.report(self.root, self.base, Decimal(80)), 1)
        result = json.loads((self.root / 'coverage/summary.json').read_text())
        self.assertEqual(result['uncovered_changed_lines'], {name: [3]})
        self.assertIn('Whole repository', summary.read_text())
        self.assertIn('New code', summary.read_text())
        self.assertIn('&lt;unsafe&gt;', (self.root / 'coverage/index.html').read_text())
        self.assertNotIn('<unsafe>', (self.root / 'coverage/index.html').read_text())

    def test_no_code_change_passes_and_cli_cannot_hide_incomplete_inputs(self):
        self.inputs()
        with contextlib.redirect_stdout(io.StringIO()):
            self.assertEqual(cr.main(['--root', str(self.root), 'validate']), 0)
            self.assertEqual(cr.main(['--root', str(self.root), 'report', '--base', self.base]), 0)
        with contextlib.redirect_stderr(io.StringIO()):
            self.assertEqual(cr.main(['--root', str(self.root), 'report', '--base', self.base, '--minimum', '101']), 1)
            self.assertEqual(cr.main(['--root', str(self.root), 'report', '--base', self.base, '--minimum', 'NaN']), 1)
            self.assertEqual(cr.main(['--root', str(self.root), 'pack', 'missing', '--format', 'jvm']), 1)
        self.assertIn('Unavailable', (self.root / 'coverage/summary.md').read_text())

    def test_cli_reports_missing_source_and_invalid_source_line(self):
        self.inputs()
        path = self.root / 'coverage/inputs/gateway-typescript/coverage.json'
        data = json.loads(path.read_text())
        data[next(iter(data))]['lines']['9999'] = True
        cr.write_json(path, data)
        metadata = path.with_name('metadata.json')
        value = json.loads(metadata.read_text()); value['payload']['coverage.json'] = cr.digest(path)
        cr.write_json(metadata, value)
        with contextlib.redirect_stderr(io.StringIO()):
            self.assertEqual(cr.main(['--root', str(self.root), 'report', '--base', self.base]), 1)
        self.assertIn('Invalid executable source line', (self.root / 'coverage/summary.md').read_text())

    def test_python_runner_runs_all_checks_and_retains_any_failure(self):
        with patch.object(run_python.subprocess, 'run') as run:
            run.side_effect = [subprocess.CompletedProcess([], 1)] + [subprocess.CompletedProcess([], 0)] * (len(run_python.CHECKS) - 1)
            self.assertEqual(run_python.main(), 1)
            self.assertEqual(run.call_count, len(run_python.CHECKS))
        with patch.object(run_python.subprocess, 'run', return_value=subprocess.CompletedProcess([], 0)):
            self.assertEqual(run_python.main(), 0)


if __name__ == '__main__':
    unittest.main()
