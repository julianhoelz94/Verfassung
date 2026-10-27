import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { Simulate } from 'react-dom/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DraftPreview } from '../../lib/editor-api';
import { TranslationProvider } from '../components/TranslationProvider';
import { SourceEvidenceWorkspace } from './SourceEvidenceWorkspace';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
const original = { datePrecision: 'unknown' as const, coverage: 'Articles 1–10' };
const preview: DraftPreview = {
  session: { id: 'session', actorId: 'owner', versionId: 'version', status: 'open', revisionCount: 1, hopKind: 'editorial_correction' },
  latestSnapshot: null,
  sourceEvidenceRevisions: [{ id: 'revision', revision: 1, original, evidence: { ...original, coverage: 'Excerpt: articles 1–10 only' }, reason: 'Clarify scope', actorId: 'owner', createdAt: '2026-10-27T12:00:00Z' }],
};

describe('source evidence workflow', () => {
  let host: HTMLElement;
  let root: Root;
  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host);
  });
  afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals(); });
  async function mount(data = preview, userId = 'owner', roles = ['editor']) {
    await act(async () => root.render(<TranslationProvider locale="de"><SourceEvidenceWorkspace preview={data} publishedEvidence={original} userId={userId} roles={roles} /></TranslationProvider>));
  }
  function button(name: string) { return [...host.querySelectorAll('button')].find(item => item.textContent === name)!; }

  it('blocks review while source input is unsaved and retains it after a stale-write rejection', async () => {
    await mount();
    expect(button('Zur Prüfung einreichen').disabled).toBe(false);
    const coverage = host.querySelector<HTMLTextAreaElement>('#source-coverage')!;
    await act(async () => { coverage.value = 'My unsaved correction'; Simulate.change(coverage); });
    expect(button('Zur Prüfung einreichen').disabled).toBe(true);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ key: 'stale_source_evidence' }, { status: 400 })));
    await act(async () => Simulate.submit(button('Quellenentwurf speichern').closest('form')!));
    expect(coverage.value).toBe('My unsaved correction');
    expect(host.querySelector('[role="alert"]')?.textContent).toContain('Deine Eingaben bleiben erhalten');
    expect(button('Zur Prüfung einreichen').disabled).toBe(true);
    const submitted = (fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body as FormData;
    expect(submitted.get('expectedRevision')).toBe('1');
  });

  it('shows saved before/after values and exact approval revision to a reviewer', async () => {
    await mount({ ...preview, session: { ...preview.session, status: 'reviewing' } }, 'reviewer', ['reviewer']);
    expect(host.querySelector('#source-coverage')).toBeNull();
    expect(host.textContent).toContain('Articles 1–10');
    expect(host.textContent).toContain('Excerpt: articles 1–10 only');
    expect(host.textContent).toContain('owner');
    const approve = button('Quellenkorrektur freigeben').closest('form')!;
    expect(new FormData(approve).get('sourceEvidenceRevision')).toBe('1');
    expect(button('Änderungen anfordern')).toBeDefined();
  });

  it('keeps editors from approving their own source correction', async () => {
    await mount({ ...preview, session: { ...preview.session, status: 'reviewing' } }, 'owner', ['editor', 'reviewer']);
    expect(button('Quellenkorrektur freigeben')).toBeUndefined();
  });
});
