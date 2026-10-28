import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Linter } from 'eslint';
import parser from '@typescript-eslint/parser';
import sonarjs from 'eslint-plugin-sonarjs';

export const LIMIT = 20;
// Temporary construction exemption requested by the user. Keep its current
// score visible, and remove this narrowly scoped entry when the page stabilizes.
export const DEFERRED_FUNCTIONS = [{
  path: 'apps/gateway-web/app/editor/page.tsx', function: 'EditorPage',
  reason: 'Editor page is under construction; deferred from the complexity cleanup.',
}];
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const baselinePath = resolve(root, 'scripts/complexity/typescript-baseline.json');
const output = resolve(root, 'build/reports/complexity/typescript');

function functionName(node) {
  if (node.id?.name) return node.id.name;
  const parent = node.parent;
  if (parent.type === 'VariableDeclarator') return parent.id.name ?? '<destructured>';
  if (parent.type === 'MethodDefinition' || parent.type === 'Property') {
    return parent.key.name ?? String(parent.key.value ?? '<computed>');
  }
  return '<anonymous>';
}

// Use the same parsed AST as SonarJS. Token hashes survive formatting, comments,
// and line shifts, but deliberately invalidate an exception when its code changes.
export function analyzeSource(source, path) {
  const functions = [];
  const inventory = {
    meta: { schema: [] },
    create(context) {
      return {
        ':function'(node) {
          const tokens = context.sourceCode.getTokens(node).map(token => [token.type, token.value]);
          // SonarJS points method diagnostics at the property key, which sits
          // outside the FunctionExpression value's range in ESTree.
          const parent = node.parent;
          const start = parent.type === 'MethodDefinition' || parent.type === 'Property'
            ? parent.key.range[0] : node.range[0];
          functions.push({
            path, function: functionName(node), line: node.loc.start.line,
            column: node.loc.start.column + 1, endLine: node.loc.end.line,
            hash: createHash('sha256').update(JSON.stringify(tokens)).digest('hex'),
            score: 0, start, end: node.range[1],
          });
        },
      };
    },
  };
  const messages = new Linter().verify(source, [{
    files: ['**/*.{js,jsx,ts,tsx,mjs,cjs,mts,cts}'],
    languageOptions: {
      parser, ecmaVersion: 'latest', sourceType: /\.c[jt]s$/.test(path) ? 'commonjs' : 'module',
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    plugins: { sonarjs, inventory: { rules: { functions: inventory } } },
    // Report every positive score; inventory supplies zero scores. The gate
    // below applies the actual limit, without inventing a second scoring model.
    rules: { 'sonarjs/cognitive-complexity': ['error', 0], 'inventory/functions': 'error' },
  }], { filename: path, allowInlineConfig: false });
  const errors = [];
  const lines = source.split('\n');
  for (const message of messages) {
    if (message.ruleId !== 'sonarjs/cognitive-complexity') {
      errors.push({ path, line: message.line ?? 1, message: message.message });
      continue;
    }
    const score = /from (\d+) to/.exec(message.message)?.[1];
    const offset = lines.slice(0, message.line - 1).reduce((sum, line) => sum + line.length + 1, 0)
      + message.column - 1;
    const fn = functions.filter(item => item.start <= offset && offset < item.end)
      .sort((a, b) => (a.end - a.start) - (b.end - b.start))[0];
    if (!fn || score === undefined) throw new Error(`Unrecognized SonarJS diagnostic in ${path}: ${message.message}`);
    fn.score = Number(score);
  }
  return { functions: functions.map(({ start, end, ...fn }) => fn), errors };
}

function identity(fn) {
  return JSON.stringify([fn.path, fn.function, fn.hash, fn.score]);
}

function deferred(fn) {
  return DEFERRED_FUNCTIONS.some(entry => entry.path === fn.path && entry.function === fn.function);
}

export function makeBaseline(functions) {
  const entries = new Map();
  for (const fn of functions.filter(item => item.score > LIMIT && !deferred(item))) {
    const key = identity(fn);
    if (!entries.has(key)) {
      const { path, function: name, hash, score } = fn;
      entries.set(key, { path, function: name, hash, score, count: 0 });
    }
    entries.get(key).count++;
  }
  return { version: 1, limit: LIMIT, entries: [...entries.values()] };
}

export function applyBaseline(functions, baseline) {
  if (baseline.version !== 1 || baseline.limit !== LIMIT || !Array.isArray(baseline.entries)) {
    throw new Error('Invalid complexity baseline version or limit');
  }
  const remaining = new Map();
  for (const entry of baseline.entries) {
    if (!Number.isInteger(entry.count) || entry.count < 1 || remaining.has(identity(entry))) {
      throw new Error('Invalid or duplicate complexity baseline entry');
    }
    remaining.set(identity(entry), entry.count);
  }
  return functions.map(fn => {
    if (fn.score <= LIMIT) return { ...fn, status: 'pass' };
    if (deferred(fn)) return { ...fn, status: 'deferred' };
    const key = identity(fn);
    const count = remaining.get(key) ?? 0;
    remaining.set(key, Math.max(0, count - 1));
    return { ...fn, status: count > 0 ? 'baseline' : 'violation' };
  });
}

export function sourceFiles(repository) {
  const files = execFileSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard',
    '--', 'apps/gateway-web', 'services/mcp-server'], { cwd: repository, encoding: 'utf8' });
  return [...new Set(files.split('\0').filter(path =>
    /\.(?:[cm]?[jt]s|[jt]sx)$/.test(path)
    && !/(?:^|\/)(?:node_modules|build|dist|generated|\.next|coverage)(?:\/|$)/.test(path)
    && !/\.d\.[cm]?ts$/.test(path)
    && existsSync(resolve(repository, path))))].sort();
}

function markdown(report) {
  const violations = report.functions.filter(fn => fn.score > LIMIT).sort((a, b) => b.score - a.score);
  const rows = violations.map(fn => `| ${fn.path}:${fn.line} | ${fn.function.replaceAll('|', '\\|')} | ${fn.score} | ${fn.status} |`);
  return [
    '# TypeScript / JavaScript cognitive complexity', '',
    `Scanned ${report.files} files and ${report.functions.length} functions. Limit: **${LIMIT}**.`,
    `${report.baselined} existing violations; ${report.deferred} deferred; **${report.newViolations} new or changed violations**; ${report.errors.length} analysis errors.`, '',
    'All function scores, including zero, are in `summary.json`. Existing exceptions only cover unchanged function tokens.', '',
    'Temporary deferral: only `EditorPage` in `apps/gateway-web/app/editor/page.tsx` is under construction. Its score stays visible below.', '',
    '| Location | Function | Score | Status |', '| --- | --- | ---: | --- |', ...rows, '',
    ...report.errors.map(error => `- ${error.path}:${error.line}: ${error.message}`), '',
  ].join('\n');
}

export function main(args = process.argv.slice(2)) {
  if (args.some(arg => arg !== '--baseline') || args.length > 1) throw new Error('Usage: node check.mjs [--baseline]');
  const files = sourceFiles(root);
  if (files.length === 0) throw new Error('No JavaScript or TypeScript source files found');
  const results = files.map(path => analyzeSource(readFileSync(resolve(root, path), 'utf8'), path));
  const functions = results.flatMap(result => result.functions);
  const errors = results.flatMap(result => result.errors);
  if (args.includes('--baseline')) {
    if (errors.length) throw new Error(`Refusing to baseline analysis errors: ${JSON.stringify(errors)}`);
    writeFileSync(baselinePath, `${JSON.stringify(makeBaseline(functions), null, 2)}\n`);
  }
  const baseline = JSON.parse(readFileSync(baselinePath, 'utf8'));
  const scored = applyBaseline(functions, baseline);
  const report = {
    limit: LIMIT, files: files.length, functions: scored, errors,
    baselined: scored.filter(fn => fn.status === 'baseline').length,
    deferred: scored.filter(fn => fn.status === 'deferred').length,
    newViolations: scored.filter(fn => fn.status === 'violation').length,
  };
  mkdirSync(output, { recursive: true });
  const summary = markdown(report);
  writeFileSync(resolve(output, 'summary.json'), `${JSON.stringify(report, null, 2)}\n`);
  writeFileSync(resolve(output, 'summary.md'), summary);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary);
  console.log(`Cognitive complexity: ${scored.length} functions; ${report.baselined} baseline; ${report.deferred} deferred; ${report.newViolations} new violations; ${errors.length} errors.`);
  console.log(`Report: ${relative(root, output)}/summary.md`);
  for (const fn of scored.filter(item => item.status === 'violation')) {
    console.error(`${fn.path}:${fn.line}:${fn.column} ${fn.function}: cognitive complexity ${fn.score} exceeds ${LIMIT}`);
  }
  for (const error of errors) console.error(`${error.path}:${error.line} ${error.message}`);
  return report.newViolations || errors.length ? 1 : 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { process.exitCode = main(); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
