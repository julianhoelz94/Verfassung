import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { fireEvent, getByRole } from '@testing-library/dom';
import { expect, it, vi } from 'vitest';
import { ChangeOverview } from './ChangeOverview';
import { changeExcerpt } from '../../lib/editor-change-context';
import type { DraftNode } from '../../lib/structured-editor';
import type { ContentOutline } from '../../lib/api';
import { TranslationProvider } from '../components/TranslationProvider';

const outline: ContentOutline = { kinds: [{ kindCode: 'article', displayLabel: 'Article', sortOrder: 1, mayHoldText: true, mayHoldChildren: false, allowedChildKinds: [], presentation: 'section', showLabel: true, showTitle: false, showKind: true }] };
const roots: DraftNode[] = [{ logicalId: 'root-id', kind: 'article', label: '20', content: [{ type: 'text', logicalId: 'text-id', text: 'Exact wording.' }] }];
it('shows human formatting changes from an unloaded article and navigates the correct indexed change', async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const host = document.createElement('div'); document.body.append(host); const root = createRoot(host), navigate = vi.fn();
  await act(async () => root.render(<ChangeOverview outline={outline} roots={[{ ...roots[0], content: [] }]} sourceRoots={[]} onNavigate={navigate} differences={[{
    logicalId: 'text-id', rootId: 'root-id', field: 'rich', before: JSON.stringify({ format: 'plain', marks: [] }), after: JSON.stringify({ format: 'plain', marks: [{ type: 'bold', start: 0, end: 5 }] }),
    beforeText: 'Exact wording.', afterText: 'Exact wording.', sourceRevisionId: 'source-revision',
  }]} />));
  expect(getByRole(host, 'heading', { name: 'Article 20' })).toBeTruthy();
  expect(host.querySelector('strong')?.textContent).toBe('Exact');
  expect(host.querySelector('[class*="versions"]')?.textContent).not.toContain('root-id');
  expect(host.querySelector('[class*="versions"]')?.textContent).not.toContain('"marks"');
  expect(host.textContent).toContain('Bold characters 1–5');
  expect(host.querySelector('details')!.open).toBe(false);
  await act(async () => fireEvent.click(getByRole(host, 'button', { name: 'Formatting and references' })));
  expect(navigate).toHaveBeenCalledWith(0);
  await act(async () => root.unmount()); host.remove();
});

it('keeps removed source wording readable and localized without exposing the serialized structural row', async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const host = document.createElement('div'); document.body.append(host); const root = createRoot(host);
  await act(async () => root.render(<TranslationProvider locale="de"><ChangeOverview outline={outline} roots={[]} sourceRoots={roots} onNavigate={() => {}} differences={[{
    logicalId: 'text-id', field: 'removed', before: 'opaque serialized structure', after: '', beforeText: changeExcerpt(roots, 'text-id'),
  }]} /></TranslationProvider>));
  expect(host.textContent).toContain('Exact wording.');
  expect(host.textContent).not.toContain('opaque serialized structure');
  expect(host.textContent).toContain('Vorher');
  expect(getByRole(host, 'button', { name: 'Article 20 · Entfernt' })).toBeTruthy();
  await act(async () => root.unmount()); host.remove();
});
