import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export function digest(value) { return createHash('sha256').update(typeof value === 'string' || Buffer.isBuffer(value) ? value : JSON.stringify(value)).digest('hex'); }
export async function allPages(api, path, actor = true, size = 100) {
  const result = [];
  for (let offset = 0; ; offset += size) {
    const page = await api('GET', `${path}${path.includes('?') ? '&' : '?'}limit=${size}&offset=${offset}`, undefined, actor);
    assert(Array.isArray(page), `${path}: expected an array page`);
    if (offset && page.some(item => result.some(old => old.id && old.id === item.id))) throw new Error(`${path}: API repeated a page`);
    result.push(...page);
    if (page.length < size) return result;
    if (offset >= 100000) throw new Error(`${path}: pagination exceeded fixture bound`);
  }
}
export function assertSubset(actual, expected, label) {
  if (Array.isArray(expected)) {
    assert(Array.isArray(actual), `${label}: expected array`);
    assert.equal(actual.length, expected.length, `${label}: length`);
    expected.forEach((value, index) => assertSubset(actual[index], value, `${label}[${index}]`));
  } else if (expected && typeof expected === 'object') {
    for (const [key, value] of Object.entries(expected)) assertSubset(actual?.[key], value, `${label}.${key}`);
  } else assert.equal(actual ?? null, expected ?? null, label);
}
export function comparableRoots(roots) {
  return roots.map(node => ({ logicalId: node.logicalId, kind: node.kind, label: node.label ?? null, title: node.title ?? null,
    content: node.content.map(entry => entry.node ? { type: 'child', node: comparableRoots([entry.node])[0] } : {
      type: 'text', logicalId: entry.logicalId, text: entry.table ? null : entry.text ?? null, format: entry.format ?? 'plain',
      table: entry.table ? { caption: entry.table.caption ?? null, rows: entry.table.rows.map(row => ({ logicalId: row.logicalId, cells: row.cells.map(cell => ({ logicalId: cell.logicalId, text: cell.text, header: cell.header ?? false, rowSpan: cell.rowSpan ?? 1, colSpan: cell.colSpan ?? 1, headers: cell.headers ?? [] })) })) } : null,
      footnoteLabel: entry.footnoteLabel ?? null, annotation: entry.annotation ?? null, marks: entry.marks ?? [], lineBreaksBefore: entry.lineBreaksBefore ?? 0,
      references: (entry.references ?? []).map(ref => ({ logicalId: ref.logicalId, start: ref.start, end: ref.end,
        target: { type: ref.target.type, logicalId: ref.target.logicalId ?? null, footnoteId: ref.target.footnoteId ?? null, url: ref.target.url ?? null } })),
    }) }));
}
export function linkRoots(roots, source) {
  const revisions = new Map();
  function collect(nodes) { for (const node of nodes) { revisions.set(node.logicalId, node.revisionId); for (const entry of node.content) entry.node ? collect([entry.node]) : revisions.set(entry.logicalId, entry.revisionId); } }
  collect(source.roots);
  const link = node => ({ ...node, ...(revisions.has(node.logicalId) ? { predecessorRevisionId: revisions.get(node.logicalId) } : {}), content: node.content.map(entry => entry.node ? { ...entry, node: link(entry.node) } : { ...entry, ...(revisions.has(entry.logicalId) ? { predecessorRevisionId: revisions.get(entry.logicalId) } : {}) }) });
  return roots.map(link);
}
export function journalAt(directory, origin) {
  mkdirSync(directory, { recursive: true });
  const path = join(directory, `scenario-journal-${digest(origin).slice(0, 16)}.json`);
  let data;
  try { data = JSON.parse(readFileSync(path, 'utf8')); } catch (error) { if (error.code !== 'ENOENT') throw error; data = { origin, scenarios: {} }; }
  assert.equal(data.origin, origin, 'Fixture journal origin');
  return { data, save() { writeFileSync(`${path}.tmp`, `${JSON.stringify(data, null, 2)}\n`, { mode: 0o600 }); renameSync(`${path}.tmp`, path); } };
}
// A completed scenario is a starting point for people. Never replay its writes.
// Before each seed step, require the exact last observed state; human changes stop
// automatic continuation even when they happen while a seed is interrupted.
export async function seedWorkflow({ key, observe, steps, journal, verifyOnly }) {
  let state = journal.data.scenarios[key];
  let current = await observe();
  if (verifyOnly) { assert(current, `${key}: missing scenario`); return { value: current, preserved: Boolean(state?.complete && state.fingerprint !== digest(current)) }; }
  if (!state) {
    if (current) return { value: current, preserved: true };
    state = journal.data.scenarios[key] = { next: 0, fingerprint: digest(current), complete: false };
    journal.save();
  }
  if (state.complete || state.fingerprint !== digest(current)) return { value: current, preserved: state.fingerprint !== digest(current) };
  for (; state.next < steps.length;) {
    await steps[state.next](current);
    current = await observe();
    state.next++;
    state.resourceId = current?.id ?? current?.session?.id ?? state.resourceId;
    state.fingerprint = digest(current);
    journal.save();
  }
  state.complete = true;
  journal.save();
  return { value: current, preserved: false };
}
