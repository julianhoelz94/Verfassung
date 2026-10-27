#!/usr/bin/env python3
"""Build commit-bound coverage inputs and a duplicate-safe changed-line CI gate."""
import argparse
from decimal import Decimal
import hashlib
import html
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import xml.etree.ElementTree as ET


SCHEMA = 1
SCOPE = ('Kotlin production sources; gateway app/lib/proxy (and legacy middleware) TypeScript and JavaScript; '
         'MCP TypeScript; Python operational tooling. Excludes tests, fixtures, generated '
         'output, declaration files, dependencies, CSS, SQL, shell and build configuration. '
         'Measures service/unit tests; browser acceptance checks run separately.')


def git(root, *args):
    return subprocess.check_output(['git', *args], cwd=root).decode().strip()


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def production(path):
    return (not re.search(r'(^|/)(test[-_]|__pycache__/)', path)
            and not re.search(r'\.(test|spec)\.', path)
            and not path.endswith('.d.ts'))


def inventory(root):
    """Discover tracked original sources, independently of which files tests import."""
    files = git(root, 'ls-files', '-z').split('\0')
    groups = {'gateway-typescript': {}, 'gateway-javascript': {}, 'mcp': {}, 'python': {}}
    for build in sorted((root / 'services').glob('*/build.gradle.kts')):
        groups['jvm-' + build.parent.name] = {}
    for path in files:
        if not path or not production(path):
            continue
        group = None
        if re.fullmatch(r'services/[^/]+/src/main/kotlin/.+\.kt', path):
            group = 'jvm-' + path.split('/')[1]
        elif re.fullmatch(r'apps/gateway-web/(app/.+|lib/.+|proxy|middleware)\.(ts|tsx|jsx)', path):
            group = 'gateway-typescript'
        elif re.fullmatch(r'apps/gateway-web/(app/.+|lib/.+|proxy|middleware)\.(js|mjs|cjs)', path):
            group = 'gateway-javascript'
        elif re.fullmatch(r'services/mcp-server/src/.+\.ts', path):
            group = 'mcp'
        elif re.fullmatch(r'(scripts|infra)/.+\.py', path):
            group = 'python'
        elif (re.fullmatch(r'services/[^/]+/src/main/.+\.(java|kts)', path)
              or re.fullmatch(r'apps/gateway-web/(app/.+|lib/.+|proxy|middleware)\.(mts|cts)', path)
              or re.fullmatch(r'services/mcp-server/src/.+\.(mts|cts|js|mjs|cjs|jsx|tsx)', path)):
            raise ValueError('Unsupported production source; configure its collector: ' + path)
        if group:
            if group not in groups:
                raise ValueError('Source has no coverage component: ' + path)
            groups[group][path] = digest(root / path)
    return groups


def canonical(root, value):
    path = Path(value)
    if not path.is_absolute():
        path = root / path
    try:
        return path.resolve().relative_to(root.resolve()).as_posix()
    except ValueError as exc:
        raise ValueError('Coverage source outside checkout: ' + value) from exc


def empty_file():
    return {'lines': {}, 'branches': {}}


def istanbul(root, path):
    result = {}
    for item in json.loads(path.read_text()).values():
        name = canonical(root, item['path'])
        data = result.setdefault(name, empty_file())
        for key, loc in item['statementMap'].items():
            line = str(loc['start']['line'])
            data['lines'][line] = data['lines'].get(line, False) or item['s'][key] > 0
        for key, loc in item['branchMap'].items():
            # Original locations identify a branch independently of report-local IDs.
            identity = json.dumps(loc, sort_keys=True, separators=(',', ':'))
            for index, count in enumerate(item['b'][key]):
                branch = identity + ':' + str(index)
                data['branches'][branch] = data['branches'].get(branch, False) or count > 0
    return result


def python_coverage(root, path):
    result = {}
    for name, item in json.loads(path.read_text())['files'].items():
        data = result.setdefault(canonical(root, name), empty_file())
        for covered, key in ((False, 'missing_lines'), (True, 'executed_lines')):
            for line in item[key]:
                data['lines'][str(line)] = covered
        for covered, key in ((False, 'missing_branches'), (True, 'executed_branches')):
            for branch in item.get(key, []):
                data['branches'][json.dumps(branch)] = covered
    return result


def jacoco(root, path, groups):
    # All JVM .exec probes are merged by JaCoCo BEFORE XML generation. In particular,
    # each platform class is supplied exactly once, with observations from all tests.
    sources = {}
    for component, files in groups.items():
        if component.startswith('jvm-'):
            for name in files:
                source = (root / name).read_text()
                package = re.search(r'^package\s+([\w.]+)', source, re.MULTILINE)
                key = ((package.group(1).replace('.', '/') + '/') if package else '') + Path(name).name
                if key in sources:
                    raise ValueError('Ambiguous JVM source identity: ' + key)
                sources[key] = name
    result = {}
    report = ET.parse(path).getroot()
    for package in report.iter('package'):
        for source in package.findall('sourcefile'):
            key = package.attrib['name'] + '/' + source.attrib['name']
            if key not in sources:
                # Kotlin SMAPs can emit empty sourcefile placeholders for inlined
                # stdlib sources (Comparisons.kt/_Collections.kt). They have no
                # executable entries. Unknown sources with any data still fail.
                if not list(source):
                    continue
                raise ValueError('Unknown JVM source: ' + key)
            data = result.setdefault(sources[key], empty_file())
            for line in source.findall('line'):
                number = line.attrib['nr']
                if int(line.attrib['ci']) + int(line.attrib['mi']):
                    data['lines'][number] = int(line.attrib['ci']) > 0
                covered = int(line.attrib['cb'])
                total = covered + int(line.attrib['mb'])
                for index in range(total):
                    data['branches'][number + ':' + str(index)] = index < covered
    for component, members in groups.items():
        if component.startswith('jvm-') and not any(result.get(name, {}).get('lines') for name in members):
            raise ValueError('JVM report omitted executable component: ' + component)
    missing = set(sources.values()) - result.keys()
    if missing:
        raise ValueError('JVM report omitted production sources: ' + ', '.join(sorted(missing)))
    return result


def write_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, indent=2, sort_keys=True) + '\n')


def provenance(root, component, files):
    return {'schema': SCHEMA, 'component': component, 'sha': git(root, 'rev-parse', 'HEAD'),
            'run_id': os.environ.get('GITHUB_RUN_ID', 'local'),
            'run_attempt': os.environ.get('GITHUB_RUN_ATTEMPT', 'local'), 'sources': files}


def pack(root, component, report_format, report):
    groups = inventory(root)
    if component not in groups or not groups[component]:
        raise ValueError('Unknown or empty coverage component: ' + component)
    destination = root / 'coverage/inputs' / component
    if destination.exists():
        shutil.rmtree(destination)
    destination.mkdir(parents=True)
    metadata = provenance(root, component, groups[component])
    if report_format == 'jvm':
        service = root / 'services' / component.removeprefix('jvm-')
        execution = service / 'build/jacoco/test.exec'
        if not execution.is_file() or not execution.stat().st_size:
            raise ValueError('Missing JVM execution data: ' + str(execution))
        shutil.copyfile(execution, destination / 'test.exec')
        classes = service / 'build/classes/kotlin/main'
        if not list(classes.rglob('*.class')):
            raise ValueError('Missing JVM production classes: ' + str(classes))
        shutil.copytree(classes, destination / 'classes')
    else:
        parsed = (istanbul if report_format == 'istanbul' else python_coverage)(root, report)
        selected = {name: data for name, data in parsed.items() if name in groups[component]}
        missing = groups[component].keys() - selected.keys()
        if missing:
            raise ValueError('Collector omitted production sources: ' + ', '.join(sorted(missing)))
        write_json(destination / 'coverage.json', selected)
    metadata['payload'] = {p.relative_to(destination).as_posix(): digest(p)
                           for p in destination.rglob('*') if p.is_file()}
    write_json(destination / 'metadata.json', metadata)
    return destination


def validate_inputs(root, groups):
    base = root / 'coverage/inputs'
    actual = {p.name for p in base.iterdir() if p.is_dir()} if base.is_dir() else set()
    if actual != groups.keys():
        raise ValueError('Coverage components differ: missing=' + str(sorted(groups.keys() - actual))
                         + ' unexpected=' + str(sorted(actual - groups.keys())))
    for component, sources in groups.items():
        directory = base / component
        metadata = json.loads((directory / 'metadata.json').read_text())
        expected = provenance(root, component, sources)
        # A failed-jobs rerun may reuse successful inputs from an earlier attempt of
        # this SAME run and commit. A different run or revision is never accepted.
        expected_attempt = expected.pop('run_attempt')
        attempt = metadata.get('run_attempt')
        compatible_attempt = (attempt == expected_attempt if expected_attempt == 'local' else
                              str(attempt).isdigit() and 1 <= int(attempt) <= int(expected_attempt))
        if {key: metadata.get(key) for key in expected} != expected or not compatible_attempt:
            raise ValueError('Stale or incompatible coverage input: ' + component)
        payload = {p.relative_to(directory).as_posix(): digest(p) for p in directory.rglob('*')
                   if p.is_file() and p.name != 'metadata.json'}
        if not payload or payload != metadata.get('payload'):
            raise ValueError('Missing or corrupted coverage payload: ' + component)


def merge_files(target, observations):
    for path, source in observations.items():
        data = target.setdefault(path, empty_file())
        for kind in ('lines', 'branches'):
            for identity, covered in source[kind].items():
                if not isinstance(covered, bool):
                    raise ValueError('Invalid coverage flag: ' + path)
                data[kind][identity] = data[kind].get(identity, False) or covered


def changed_lines(root, base, head, eligible):
    files = git(root, 'diff', '--name-only', '--no-renames', '--diff-filter=AM', '-z', base, head).split('\0')
    changed = {}
    for name in files:
        if name not in eligible:
            continue
        patch = git(root, 'diff', '--no-ext-diff', '--no-renames', '--unified=0', base, head, '--', name)
        lines = set()
        for start, length in re.findall(r'^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@', patch, re.MULTILINE):
            lines.update(range(int(start), int(start) + (int(length) if length else 1)))
        changed[name] = lines
    return changed


def comparison_base(root, event_path):
    event = json.loads(event_path.read_text())
    head = git(root, 'rev-parse', 'HEAD')
    if 'pull_request' in event:
        return git(root, 'merge-base', event['pull_request']['base']['sha'], head)
    before = event.get('before', '')
    if re.fullmatch('[0-9a-f]{40}', before) and before != '0' * 40:
        return git(root, 'rev-parse', before + '^{commit}')
    raise ValueError('CI event has no previous revision for changed-code comparison')


def metrics(flags):
    flags = list(flags)
    covered, total = sum(flags), len(flags)
    return {'covered': covered, 'total': total,
            'percent': round(100 * covered / total, 2) if total else None}


def display(metric):
    if not metric['total']:
        return 'N/A (no executable lines)'
    return f"{metric['percent']:.2f}% ({metric['covered']}/{metric['total']})"


def summarize(files, groups, changed, head, base, minimum):
    new = [(path, line, hit) for path, data in files.items() for line, hit in data['lines'].items()
           if int(line) in changed.get(path, set())]
    whole = metrics(hit for data in files.values() for hit in data['lines'].values())
    fresh = metrics(hit for _, _, hit in new)
    components = {group: {kind: metrics(hit for name in sources for hit in files[name][kind].values())
                          for kind in ('lines', 'branches')} for group, sources in groups.items()}
    passed = not fresh['total'] or Decimal(fresh['covered']) * 100 >= minimum * fresh['total']
    return {'schema': SCHEMA, 'head': head, 'base': base, 'scope': SCOPE,
            'whole_repo': whole, 'new_code': fresh, 'minimum_new_code': str(minimum),
            'gate_passed': passed, 'components': components,
            'uncovered_changed_lines': {path: sorted(int(line) for p, line, hit in new if p == path and not hit)
                                        for path in sorted({p for p, _, hit in new if not hit})}}


def render(root, result, files):
    output = root / 'coverage'
    write_json(output / 'summary.json', result)
    write_json(output / 'source-lines.json', files)
    text = ('# Code coverage\n\n| Statistic | Line coverage |\n| --- | --- |\n'
            f"| Whole repository | {display(result['whole_repo'])} |\n"
            f"| New code | {display(result['new_code'])} |\n\n"
            f"New-code minimum: {result['minimum_new_code']}%. Gate: {'PASS' if result['gate_passed'] else 'FAIL'}.\n\n"
            f"Tested revision: `{result['head']}`. Comparison base: `{result['base']}`.\n\n"
            + result['scope'] + '\n\n| Component | Lines | Branches |\n| --- | --- | --- |\n')
    for component, data in result['components'].items():
        text += f"| {component} | {display(data['lines'])} | {display(data['branches'])} |\n"
    for name, lines in result['uncovered_changed_lines'].items():
        text += '\nUncovered changed lines in `' + name + '`: ' + ', '.join(map(str, lines)) + '\n'
    (output / 'summary.md').write_text(text)
    if os.environ.get('GITHUB_STEP_SUMMARY'):
        with open(os.environ['GITHUB_STEP_SUMMARY'], 'a') as summary:
            summary.write(text)
    report = ('<!doctype html><meta charset="utf-8"><title>Repository code coverage</title>'
              '<style>body{font:16px system-ui;max-width:1000px;margin:2rem auto}pre{overflow:auto}'
              '.hit{background:#d8f5df}.miss{background:#ffdedb}summary{cursor:pointer}</style>'
              '<h1>Code coverage</h1><p>Whole repository: <b>' + display(result['whole_repo'])
              + '</b></p><p>New code: <b>' + display(result['new_code']) + '</b></p><p>'
              + html.escape(result['scope']) + '</p><pre>' + html.escape(text) + '</pre>')
    for name, data in sorted(files.items()):
        report += '<details><summary>' + html.escape(name) + ': ' + display(metrics(data['lines'].values())) + '</summary><pre>'
        for number, source in enumerate((root / name).read_text().splitlines(), 1):
            hit = data['lines'].get(str(number))
            css = '' if hit is None else ('hit' if hit else 'miss')
            report += f'<span class="{css}">{number:5} {html.escape(source)}</span>\n'
        report += '</pre></details>'
    (output / 'index.html').write_text(report)
    print(text)


def report(root, base, minimum):
    groups = inventory(root)
    validate_inputs(root, groups)
    files = {}
    merge_files(files, jacoco(root, root / 'coverage/jvm.xml', groups))
    for component in groups:
        if not component.startswith('jvm-'):
            merge_files(files, json.loads((root / 'coverage/inputs' / component / 'coverage.json').read_text()))
    eligible = {name for sources in groups.values() for name in sources}
    if files.keys() != eligible:
        raise ValueError('Aggregated source inventory differs from eligible production sources')
    for name, data in files.items():
        count = len((root / name).read_text().splitlines())
        if any(not line.isdecimal() or not 1 <= int(line) <= count for line in data['lines']):
            raise ValueError('Invalid executable source line: ' + name)
    head = git(root, 'rev-parse', 'HEAD')
    changed = changed_lines(root, base, head, eligible)
    result = summarize(files, groups, changed, head, base, minimum)
    render(root, result, files)
    return 0 if result['gate_passed'] else 1


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root', type=Path, default=Path(__file__).resolve().parents[2])
    sub = parser.add_subparsers(dest='command', required=True)
    bundle = sub.add_parser('pack')
    bundle.add_argument('component')
    bundle.add_argument('--format', choices=['jvm', 'istanbul', 'python'], required=True)
    bundle.add_argument('--report', type=Path)
    gate = sub.add_parser('report')
    gate.add_argument('--base')
    gate.add_argument('--event', type=Path)
    gate.add_argument('--minimum', type=Decimal, default=Decimal('80'))
    sub.add_parser('validate')
    args = parser.parse_args(argv)
    try:
        if args.command == 'pack':
            print(pack(args.root, args.component, args.format, args.report))
            return 0
        if args.command == 'validate':
            validate_inputs(args.root, inventory(args.root))
            return 0
        base = args.base or comparison_base(args.root, args.event)
        if not args.minimum.is_finite() or not 0 <= args.minimum <= 100:
            raise ValueError('Coverage minimum must be between 0 and 100')
        return report(args.root, base, args.minimum)
    except (ValueError, OSError, KeyError, TypeError, ET.ParseError, subprocess.CalledProcessError) as exc:
        message = 'Coverage unavailable: ' + str(exc)
        print(message, file=sys.stderr)
        args.root.joinpath('coverage').mkdir(exist_ok=True)
        args.root.joinpath('coverage/summary.md').write_text(
            '# Code coverage\n\nWhole repository: **Unavailable**\n\nNew code: **Unavailable**\n\n' + message + '\n')
        if os.environ.get('GITHUB_STEP_SUMMARY'):
            with open(os.environ['GITHUB_STEP_SUMMARY'], 'a') as summary:
                summary.write(args.root.joinpath('coverage/summary.md').read_text())
        return 1


if __name__ == '__main__':
    raise SystemExit(main())
