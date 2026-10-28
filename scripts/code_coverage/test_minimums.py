"""GATE-1: absolute floors supplement rather than replace the changed-line gate."""
import copy
import contextlib
import io
import json
from pathlib import Path
import tempfile
from decimal import Decimal
import unittest

import coverage_report as cr


class MinimumTests(unittest.TestCase):
    def result(self, covered=80, total=100, new_passed=True):
        metric = {'covered': covered, 'total': total, 'percent': round(100 * covered / total, 2) if total else None}
        return {'whole_repo': metric, 'components': {'app': {'lines': copy.deepcopy(metric)}}, 'gate_passed': new_passed,
                'new_code': {'covered': 0, 'total': 0, 'percent': None}}

    def policy(self, whole='80', component='80'):
        return {'schema': 1, 'whole_repo': whole, 'components': {'app': component}}

    def test_exact_boundary_passes_and_empty_changed_lines_remain_not_applicable(self):
        result = self.result()
        cr.enforce_minimums(result, self.policy())
        self.assertTrue(result['gate_passed'])
        self.assertEqual(result['coverage_failures'], [])
        self.assertIsNone(result['new_code']['percent'])

    def test_rounded_eighty_percent_does_not_pass_when_the_actual_ratio_is_lower(self):
        result = self.result(79999, 100000)
        self.assertEqual(result['whole_repo']['percent'], 80.0)
        cr.enforce_minimums(result, self.policy())
        self.assertFalse(result['gate_passed'])
        self.assertEqual(len(result['coverage_failures']), 2)

    def test_component_regression_fails_even_when_the_aggregate_passes(self):
        result = self.result(90)
        result['components']['app']['lines'] = {'covered': 79, 'total': 100, 'percent': 79.0}
        cr.enforce_minimums(result, self.policy())
        self.assertFalse(result['gate_passed'])
        self.assertEqual(result['coverage_failures'], ['app: 79.00% (79/100) is below 80%'])

    def test_existing_changed_code_failure_cannot_be_overridden_by_absolute_floors(self):
        result = self.result(100, new_passed=False)
        cr.enforce_minimums(result, self.policy())
        self.assertFalse(result['gate_passed'])
        self.assertEqual(result['coverage_failures'], [])

    def test_no_executable_lines_is_not_a_passing_overall_measurement(self):
        result = self.result(0, 0)
        cr.enforce_minimums(result, self.policy())
        self.assertFalse(result['gate_passed'])
        self.assertEqual(len(result['coverage_failures']), 2)

    def test_policy_requires_all_components_and_rejects_unknown_components(self):
        for components in ({}, {'wrong-name': '80'}, {'app': '80', 'extra': '0'}):
            with self.subTest(components=components), self.assertRaisesRegex(ValueError, 'every component'):
                cr.enforce_minimums(self.result(), {'schema': 1, 'whole_repo': '80', 'components': components})

    def test_invalid_and_nonfinite_thresholds_cannot_disable_the_gate(self):
        for minimum in ('NaN', 'Infinity', '-1', '100.1', 'invalid', True, None):
            with self.subTest(minimum=minimum), self.assertRaises(ValueError):
                cr.enforce_minimums(self.result(), self.policy(whole=minimum))

    def test_policy_schema_and_unknown_fields_fail_closed(self):
        for policy in ({}, {**self.policy(), 'schema': 2}, {**self.policy(), 'typo': '80'}):
            with self.subTest(policy=policy), self.assertRaises(ValueError):
                cr.enforce_minimums(self.result(), policy)

    def test_failed_floors_are_visible_in_machine_and_human_reports(self):
        result = self.result(79)
        result.update(schema=1, head='tested-head', base='comparison-base', scope='production sources', minimum_new_code='80', uncovered_changed_lines={})
        result['components']['app']['branches'] = {'covered': 0, 'total': 0, 'percent': None}
        cr.enforce_minimums(result, self.policy())
        with tempfile.TemporaryDirectory() as directory, contextlib.redirect_stdout(io.StringIO()):
            root = Path(directory)
            cr.render(root, result, {})
            summary = (root / 'coverage/summary.md').read_text()
            self.assertIn('Whole-repository minimum: 80%', summary)
            self.assertIn('FAILED: app:', summary)
            self.assertFalse(json.loads((root / 'coverage/summary.json').read_text())['gate_passed'])
            self.assertIn('below 80%', (root / 'coverage/index.html').read_text())

    def test_decimal_threshold_is_applied_without_float_rounding(self):
        result = self.result(83333, 100000)
        cr.enforce_minimums(result, self.policy(whole='83.333', component='83.334'))
        self.assertFalse(result['gate_passed'])
        self.assertEqual(len(result['coverage_failures']), 1)
        self.assertEqual(Decimal(result['minimum_whole_repo']), Decimal('83.333'))


if __name__ == '__main__':
    unittest.main()
