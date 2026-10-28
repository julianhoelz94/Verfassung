import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { analyzeSource, applyBaseline, makeBaseline, sourceFiles } from './check.mjs';

const complex = `function example(value: number) {
  if (value > 0) { if (value > 1) { if (value > 2) {
    if (value > 3) { if (value > 4) { if (value > 5) { return value; } } }
  } } }
  return 0;
}`;

function analyze(source, path = 'apps/gateway-web/example.ts') {
  const result = analyzeSource(source, path);
  assert.deepEqual(result.errors, []);
  return result.functions;
}

test('SonarJS scores nesting and reports zero-score functions', () => {
  const functions = analyze(`${complex}\nconst simple = () => 1;`);
  assert.deepEqual(functions.map(fn => [fn.function, fn.score]), [['example', 21], ['simple', 0]]);
});

test('limit is inclusive at 15, and 16 fails without a baseline', () => {
  for (const score of [15, 16]) {
    const functions = analyze(`function branches(x: number) { ${'if (x) x--;'.repeat(score)} }`);
    assert.equal(functions[0].score, score);
    const [fn] = applyBaseline(functions, makeBaseline([]));
    assert.equal(fn.status, score === 15 ? 'pass' : 'violation');
  }
});

test('baseline allows unchanged tokens after line, formatting, and comment changes', () => {
  const baseline = makeBaseline(analyze(complex));
  const shifted = analyze(`// shifted\n\n${complex.replace('value > 0', 'value /* comment */ > 0')}`);
  assert.equal(applyBaseline(shifted, baseline)[0].status, 'baseline');
});

test('modified over-limit function cannot inherit its old baseline entry', () => {
  const baseline = makeBaseline(analyze(complex));
  const changed = analyze(complex.replace('return 0', 'return 1'));
  assert.equal(applyBaseline(changed, baseline)[0].status, 'violation');
});

test('new functions and duplicate copies cannot reuse an existing exception', () => {
  const functions = analyze(complex);
  const baseline = makeBaseline(functions);
  assert.equal(applyBaseline(analyze(complex.replaceAll('example', 'newExample')), baseline)[0].status, 'violation');
  assert.deepEqual(applyBaseline([...functions, ...functions], baseline).map(fn => fn.status), ['baseline', 'violation']);
  assert.equal(applyBaseline(analyze(complex, 'services/mcp-server/other.ts'), baseline)[0].status, 'violation');
});

test('refactored functions pass and old exceptions do not prevent cleanup', () => {
  const baseline = makeBaseline(analyze(complex));
  assert.equal(applyBaseline(analyze('function example(value: number) { return value; }'), baseline)[0].status, 'pass');
  assert.deepEqual(applyBaseline([], baseline), []);
});

test('parsing failures are errors rather than a clean report', () => {
  const result = analyzeSource('function broken( {', 'apps/gateway-web/broken.ts');
  assert.equal(result.errors.length, 1);
  assert.match(result.errors[0].message, /Parsing error/);
});

test('lint disable comments cannot suppress the CI metric', () => {
  assert.equal(analyze(`/* eslint-disable sonarjs/cognitive-complexity */\n${complex}`)[0].score, 21);
});

test('supports TSX components, methods, nested functions, and CommonJS', () => {
  const functions = analyze(`export function Component({ value }: { value: boolean }) {
    const nested = () => value ? 1 : 0;
    return <div>{value ? nested() : null}</div>;
  }
  class Example { method(value: boolean) { if (value) return 1; return 0; } }`, 'apps/gateway-web/example.tsx');
  assert.deepEqual(functions.map(fn => [fn.function, fn.score]), [['Component', 1], ['nested', 1], ['method', 1]]);
  assert.equal(analyze('module.exports = function run(value) { if (value) return 1; };', 'apps/gateway-web/example.cjs')[0].score, 1);
  assert.equal(analyze('export const check = (value: boolean) => value ? 1 : 0;', 'apps/gateway-web/example.mts')[0].score, 1);
  assert.equal(analyze('module.exports = (value: boolean) => value ? 1 : 0;', 'apps/gateway-web/example.cts')[0].score, 1);
});

test('object and class method diagnostics belong to the method, not the enclosing function', () => {
  const functions = analyze(`function outer() {
    return { method(value: boolean) { if (value) return 1; return 0; },
      get computed() { if (true) return 1; return 0; } };
  }
  class Example {
    #privateMethod(value: boolean) { if (value) return 1; return 0; }
    static publicMethod(value: boolean) { if (value) return 1; return 0; }
  }`);
  assert.deepEqual(functions.map(fn => [fn.function, fn.score]), [
    ['outer', 0], ['method', 1], ['computed', 1], ['privateMethod', 1], ['publicMethod', 1],
  ]);
});

test('rejects invalid baselines instead of silently allowing violations', () => {
  assert.throws(() => applyBaseline([], { version: 1, limit: 99, entries: [] }), /Invalid/);
  const baseline = makeBaseline(analyze(complex));
  baseline.entries[0].count = -1;
  assert.throws(() => applyBaseline([], baseline), /Invalid/);
});

test('discovers both applications and new source, excluding generated output and declarations', () => {
  const repository = mkdtempSync(join(tmpdir(), 'complexity-'));
  try {
    execFileSync('git', ['init', '--quiet'], { cwd: repository });
    const paths = [
      'apps/gateway-web/app/new.tsx', 'apps/gateway-web/lib/helper.js',
      'apps/gateway-web/e2e/journey.spec.ts', 'services/mcp-server/src/server.ts',
      'services/mcp-server/src/new.mts', 'services/mcp-server/src/new.cts',
      'apps/gateway-web/.next/output.js', 'apps/gateway-web/e2e/fixtures/generated/data.js',
      'services/mcp-server/dist/server.js', 'apps/gateway-web/next-env.d.ts',
      'services/mcp-server/src/types.d.mts', 'services/mcp-server/src/types.d.cts',
    ];
    for (const path of paths) {
      mkdirSync(join(repository, path, '..'), { recursive: true });
      writeFileSync(join(repository, path), '');
    }
    const deleted = 'services/mcp-server/src/deleted.ts';
    writeFileSync(join(repository, deleted), '');
    execFileSync('git', ['add', deleted], { cwd: repository });
    rmSync(join(repository, deleted));
    assert.deepEqual(sourceFiles(repository), paths.slice(0, 6).sort());
  } finally { rmSync(repository, { recursive: true, force: true }); }
});
