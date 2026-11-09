import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { fireEvent, getByRole, getByLabelText, getByText } from '@testing-library/dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DraftPreview } from '../../lib/editor-api';
import { TranslationProvider } from '../components/TranslationProvider';
import { SourceEvidenceWorkspace } from './SourceEvidenceWorkspace';
import { DocumentManager } from './documents/DocumentManager';
import type { DocumentRecord } from '../../lib/document-api';

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
    const coverage = host.querySelector<HTMLTextAreaElement>('#source-description')!;
    await act(async () => { fireEvent.change(coverage, { target: { value: 'My unsaved correction' } }); });
    expect(button('Zur Prüfung einreichen').disabled).toBe(true);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ key: 'stale_source_evidence' }, { status: 400 })));
    await act(async () => { fireEvent.submit(host.querySelector('#source-evidence-form')!); });
    expect(coverage.value).toBe('My unsaved correction');
    expect(host.querySelector('[role="alert"]')?.textContent).toContain('Deine Eingaben bleiben erhalten');
    expect(button('Zur Prüfung einreichen').disabled).toBe(true);
    const submitted = (fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body as FormData;
    expect(submitted.get('expectedRevision')).toBe('1');
    expect(submitted.get('reason')).toBe('Clarify scope');
  });

  it('offers one free source description and keeps the correction reason separate', async () => {
    await mount();
    const source = host.querySelector('#source-evidence')!;
    expect(source.querySelector('[name="reason"]')).toBeNull();
    expect(source.querySelectorAll('textarea')).toHaveLength(1);
    expect(source.querySelector('select')).toBeNull();
    expect(host.querySelector<HTMLTextAreaElement>('#source-description')!.value).toContain('Excerpt: articles 1–10 only');
    expect(host.querySelector('#source-change-reason #source-reason')).not.toBeNull();
    expect(source.querySelector('details')?.open).toBe(false);
    expect(button('Quellenentwurf speichern').getAttribute('form')).toBe('source-evidence-form');
  });

  it('shows saved before/after values and exact approval revision to a reviewer', async () => {
    await mount({ ...preview, session: { ...preview.session, status: 'reviewing' } }, 'reviewer', ['reviewer']);
    expect(host.querySelector('#source-description')).toBeNull();
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

  it('attaches an exact version source and passage note without losing an unsaved narrative correction', async () => {
    const source: DocumentRecord = {id:'source',currentRevision:1,status:'active',createdAt:'2026-01-01',revision:{id:'pin',documentId:'source',revision:1,title:'Original gazette',description:null,sourceUrl:'https://example.org/gazette',fileName:null,contentType:null,createdAt:'2026-01-01',createdBy:'editor'}};
    const send = vi.fn().mockResolvedValue(Response.json({links:[{documentId:'source',revisionId:'pin',document:source,citationNote:'Chapter 3'}]}));
    vi.stubGlobal('fetch',send);
    await act(async () => root.render(<TranslationProvider locale="en"><SourceEvidenceWorkspace preview={preview} publishedEvidence={original} userId="owner" roles={['editor']}
      documentsPanel={<DocumentManager targetType="version" targetId="version" canEdit links={[]} documents={[source]} revisions={{}} />} /></TranslationProvider>));
    const narrative = host.querySelector<HTMLTextAreaElement>('#source-description')!;
    await act(async () => fireEvent.change(narrative,{target:{value:'Unsaved source correction'}}));
    await act(async () => fireEvent.click(getByRole(host,'button',{name:'Choose existing document',exact:true})));
    await act(async () => fireEvent.change(getByLabelText(host,'Search documents'),{target:{value:'gazette'}}));
    await act(async () => fireEvent.click(getByRole(host,'option',{name:/Original gazette/})));
    await act(async () => fireEvent.click(getByText(host,'Citation note / relevant passage',{selector:'summary'})));
    await act(async () => fireEvent.change(getByLabelText(host,'Note for this attachment'),{target:{value:'Chapter 3'}}));
    await act(async () => fireEvent.click(getByRole(host,'button',{name:'Attach document',exact:true})));
    const submitted = send.mock.calls[0][1].body as FormData;
    expect(Object.fromEntries(submitted)).toMatchObject({targetType:'version',targetId:'version',documentId:'source',revisionId:'pin',citationNote:'Chapter 3'});
    expect(narrative.value).toBe('Unsaved source correction');
    expect(getByText(host,'Chapter 3',{selector:'p'})).toBeTruthy();
    expect(getByRole<HTMLButtonElement>(host,'button',{name:'Submit for review',exact:true}).disabled).toBe(true);
  });
});
