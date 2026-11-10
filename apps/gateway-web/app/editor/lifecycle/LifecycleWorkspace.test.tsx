import { act } from 'react';
import { fireEvent, getByLabelText, getByRole, getByText, queryByRole } from '@testing-library/dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount } from '../../../test/dom';
import { LifecycleWorkspace } from './LifecycleWorkspace';
import { appendLifecycleAction, appendProvisionAction, reviseLifecycleEvidenceAction } from './actions';
import type { ConstitutionLifecycleEvent, ProvisionLifecycleEvent } from '../../../lib/api';

vi.mock('./actions', () => ({ appendLifecycleAction: vi.fn(), appendProvisionAction: vi.fn(), reviseLifecycleEvidenceAction: vi.fn() }));
const adopted: ConstitutionLifecycleEvent = { id: 'adopted', constitutionId: 'constitution', eventType: 'adopted', eventDate: '1949-05-08', dateCertainty: 'exact', note: 'Original evidence', sourceUrl: 'https://example.org/old', evidenceRevisionId: 'evidence-r1' };
const provision: ProvisionLifecycleEvent = { id: 'provision', constitutionId: 'constitution', sourceVersionId: 'old', eventType: 'deferred', eventDate: '2099-01-01', logicalUnitIds: ['sentence'], note: null, sourceUrl: null };
const units = [{ id: 'article', label: 'Article 1', path: 'Article 1', depth: 0, text: '' }, { id: 'sentence', label: 'Sentence 2', path: 'Article 1 / Sentence 2', depth: 1, text: 'Human dignity' }];
const documentId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const source = { id: documentId, currentRevision: 2, status: 'active', createdAt: '2026-01-01', revision: { id: 'pin-2', documentId, revision: 2, title: 'Archival evidence', fileName: null, contentType: null, sourceUrl: 'https://example.org/archive', description: null, createdAt: '2026-01-01', createdBy: 'editor' } };
const base = { constitutionId: 'constitution', code: 'DE', canCreate: true, title: 'Constitution', ownerName: 'Germany', ownerHref: '/countries/DE', events: [] as ConstitutionLifecycleEvent[], provisions: [] as ProvisionLifecycleEvent[], versions: [{ id: 'current', label: 'Current' }, { id: 'old', label: 'Old' }], sourceVersionId: 'current', units, materials: {}, provisionContexts: {}, asOf: '2026-11-10', returnTo: '/editor/lifecycle/constitution?code=DE' };
let view: Awaited<ReturnType<typeof mount>>;
const assign = vi.fn();
const dialogDescriptor = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, 'showModal');
const click = async (element: Element) => { await act(async () => { fireEvent.click(element); }); };
const change = async (element: Element, value: string) => { await act(async () => { fireEvent.change(element, { target: { value } }); }); };
const button = (name: string, scope: HTMLElement = view.host) => getByRole(scope, 'button', { name, exact: true });
const tab = (name: string) => getByRole(view.host, 'tab', { name, exact: true });
const field = (name: string, scope: HTMLElement = view.host) => getByLabelText(scope, name, { exact: true }) as HTMLInputElement;
const owner = (scope = 'event') => view.host.querySelector<HTMLFormElement>(`#${scope}-date`)!.form!;
const submit = async (form: HTMLFormElement) => { await act(async () => { fireEvent.submit(form); }); };
async function render(props: Partial<Parameters<typeof LifecycleWorkspace>[0]> = {}) { view = await mount(<LifecycleWorkspace {...base} {...props} />); }
async function choosePassage() {
  await click(button('Select provisions'));
  const dialog = getByRole(view.host, 'dialog');
  await change(getByRole(dialog, 'searchbox'), 'Human');
  await click(getByRole(dialog, 'checkbox'));
  await click(button('Use selection', dialog));
}

beforeEach(() => {
  vi.clearAllMocks(); localStorage.clear();
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', { configurable: true, value: function (this: HTMLDialogElement) { this.open = true; } });
  const realWindow = window;
  vi.stubGlobal('window', new Proxy(realWindow, { get(target, key) { return key === 'location' ? { origin: 'http://localhost', assign } : Reflect.get(target, key, target); } }));
  vi.spyOn(globalThis, 'fetch').mockImplementation(async input => {
    const url = new URL(String(input), 'http://localhost');
    if (url.pathname.endsWith('/units')) return Response.json({ units: [{ ...units[0], id: 'old-article' }] });
    const command = url.searchParams.get('command');
    if (command === 'folders') return Response.json([]);
    if (command === 'revisions') return Response.json({ revisions: [source.revision] });
    return Response.json({ items: [source], total: 1, offset: 0, limit: 30 });
  });
  vi.mocked(appendLifecycleAction).mockResolvedValue('/editor/lifecycle/constitution?saved=1');
  vi.mocked(appendProvisionAction).mockResolvedValue('/editor/lifecycle/constitution?saved=1');
  vi.mocked(reviseLifecycleEvidenceAction).mockResolvedValue('/editor/lifecycle/constitution?saved=1');
});
afterEach(async () => {
  await view?.close(); vi.restoreAllMocks(); vi.unstubAllGlobals();
  if (dialogDescriptor) Object.defineProperty(HTMLDialogElement.prototype, 'showModal', dialogDescriptor); else Reflect.deleteProperty(HTMLDialogElement.prototype, 'showModal');
});

describe('lifecycle workspace integration', () => {
  it('retains independent drafts and keyboard focus while switching scope, tabs and context', async () => {
    localStorage.setItem('atlas-lifecycle-context', 'hidden');
    await render({ events: [adopted], provisions: [provision], saved: true, failed: true, backHref: '/event' });
    expect(queryByRole(view.host, 'complementary')).toBeNull();
    await click(button('Show context pane'));
    expect(localStorage.getItem('atlas-lifecycle-context')).toBe('shown');
    expect(getByRole(view.host, 'complementary').textContent).toContain('Adopted, not yet in force');
    await change(view.host.querySelector('#event-note')!, 'Whole draft');
    await click(getByRole(view.host, 'radio', { name: /Selected provisions/ }));
    await change(view.host.querySelector('#provision-event-note')!, 'Provision draft');
    await click(tab('History'));
    await act(async () => { fireEvent.keyDown(tab('History'), { key: 'Home' }); });
    expect(document.activeElement).toBe(tab('Record event'));
    expect((view.host.querySelector('#provision-event-note') as HTMLInputElement).value).toBe('Provision draft');
    await click(getByRole(view.host, 'radio', { name: /Whole constitution/ }));
    expect((view.host.querySelector('#event-note') as HTMLInputElement).value).toBe('Whole draft');
    await act(async () => { fireEvent.keyDown(tab('Record event'), { key: 'End' }); });
    expect(document.activeElement).toBe(tab('History'));
    await act(async () => { fireEvent.keyDown(tab('History'), { key: 'ArrowLeft' }); fireEvent.keyDown(tab('Record event'), { key: 'a' }); });
    expect(tab('Record event').getAttribute('aria-selected')).toBe('true');
    await click(button('View full history →'));
    await change(getByRole(view.host, 'combobox', { name: 'History', exact: true }), 'passages');
    expect(getByRole(view.host, 'tabpanel').textContent).toContain('Commencement deferred');
  });

  it('reviews pinned evidence, preserves failed saves and reuses the event receipt on retry', async () => {
    await render(); const form = owner();
    await change(field('Event', form), 'adopted'); await change(field('Effective date', form), '1949-05-08');
    await change(view.host.querySelector('#event-note')!, 'Supported by archive');
    await click(button('Choose existing document', form));
    const search = getByRole(form, 'combobox', { name: 'Search documents' });
    await change(search, 'archive');
    await act(async () => { fireEvent.focus(search); fireEvent.keyDown(search, { key: 'ArrowDown' }); fireEvent.keyDown(search, { key: 'Enter' }); });
    await click(button('Attach document', form));
    await submit(form);
    expect(appendLifecycleAction).not.toHaveBeenCalled();
    expect(getByRole(view.host, 'dialog').textContent).toContain('Archival evidence · Revision 2');
    await click(button('Back to details'));
    expect(queryByRole(view.host, 'dialog')).toBeNull();
    vi.mocked(appendLifecycleAction).mockResolvedValueOnce('/editor/lifecycle/constitution?error=1');
    await submit(form); await click(button('Save event'));
    expect(getByRole(form, 'alert').textContent).toContain('Your entries are preserved');
    expect((view.host.querySelector('#event-note') as HTMLInputElement).value).toBe('Supported by archive');
    const first = vi.mocked(appendLifecycleAction).mock.calls[0][0];
    expect(JSON.parse(String(first.get('stagedDocuments')))).toEqual([{ documentId, revision: 2 }]);
    await submit(form); await click(button('Save event'));
    expect(vi.mocked(appendLifecycleAction).mock.calls[1][0].get('operationId')).toBe(first.get('operationId'));
    expect(assign).toHaveBeenCalledWith('/editor/lifecycle/constitution?saved=1');
  });

  it('selects exact units, cancels draft changes and keeps the source selection when loading fails', async () => {
    await render(); await click(getByRole(view.host, 'radio', { name: /Selected provisions/ }));
    const form = owner('provision-event');
    await submit(form); expect(getByRole(form, 'alert').textContent).toContain('No provisions selected');
    await choosePassage(); expect(new FormData(form).getAll('logicalUnitIds')).toEqual(['sentence']);
    await click(button('Select provisions'));
    const picker = getByRole(view.host, 'dialog');
    await change(getByRole(picker, 'searchbox'), 'missing'); expect(picker.textContent).toContain('No matching provisions');
    await click(button('Cancel', picker));
    await change(field('Source version'), 'old'); await click(button('Cancel', getByRole(view.host, 'dialog')));
    expect(field('Source version').value).toBe('current');
    vi.mocked(fetch).mockRejectedValueOnce(new Error('unavailable'));
    await change(field('Source version'), 'old'); await click(button('Change source version?'));
    expect(field('Source version').value).toBe('current'); expect(new FormData(form).getAll('logicalUnitIds')).toEqual(['sentence']);
    expect(getByRole(form, 'alert').textContent).toContain('Your current selection');
    await change(field('Event', form), 'deferred'); await change(field('Effective date', form), '2030-01-01');
    await submit(form); expect(getByRole(view.host, 'dialog').textContent).toContain('Article 1 / Sentence 2');
    await click(button('Save event')); expect(appendProvisionAction).toHaveBeenCalled();
    await change(field('Source version'), 'old'); await click(button('Change source version?'));
    expect(field('Source version').value).toBe('old'); expect(new FormData(form).getAll('logicalUnitIds')).toEqual([]);
    expect(field('Effective date', form).value).toBe('2030-01-01');
    await click(button('Select provisions')); await click(button('Close', getByRole(view.host, 'dialog')));
  });

  it('preserves upload metadata through scope changes and waits for an in-flight upload before review', async () => {
    await render(); const form = owner();
    await click(button('Upload new document', form));
    await change(field('Title', form), 'Unfinished source'); await change(field('Source URL', form), 'https://example.org/source');
    await change(field('Citation key', form), 'Archive1949');
    await click(getByRole(view.host, 'radio', { name: /Selected provisions/ })); await click(getByRole(view.host, 'radio', { name: /Whole constitution/ }));
    expect(field('Citation key', form).value).toBe('Archive1949');
    let finish!: (response: Response) => void;
    vi.mocked(fetch).mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    await click(button('Create and attach', form));
    expect((button('Review details', form) as HTMLButtonElement).disabled).toBe(true);
    await act(async () => finish(Response.json({ document: source })));
    expect((button('Review details', form) as HTMLButtonElement).disabled).toBe(false);
    expect(getByRole(form, 'link', { name: 'Archival evidence' }).getAttribute('href')).toContain('revision=2');
  });

  it('retains evidence edits across history filters and keeps pinned provision metadata separate', async () => {
    await render({ initialEventId: 'adopted', events: [adopted], provisions: [provision], materials: { adopted: <p>Scoped documents</p> }, provisionContexts: { provision: { versionHref: '/countries/DE/versions/old', versionLabel: 'Old', units: [{ id: 'sentence', path: 'Old Article / Sentence 2' }] } } });
    const note = field('Event note'); await change(note, 'Updated evidence');
    await change(getByRole(view.host, 'combobox', { name: 'History', exact: true }), 'passages'); expect(getByRole(view.host, 'link', { name: 'Old' }).getAttribute('href')).toBe('/countries/DE/versions/old');
    await change(getByRole(view.host, 'combobox', { name: 'History', exact: true }), 'all'); expect(note.value).toBe('Updated evidence');
    await click(button('Edit evidence')); await click(button('Edit evidence'));
    vi.mocked(reviseLifecycleEvidenceAction).mockRejectedValueOnce(new Error('network'));
    await submit(note.form!); expect(getByRole(note.form!, 'alert').textContent).toContain('Your entries are preserved');
    await submit(note.form!);
    const data = vi.mocked(reviseLifecycleEvidenceAction).mock.calls[1][0];
    expect(data.get('expectedRevisionId')).toBe('evidence-r1'); expect(data.get('sourceUrl')).toBe(adopted.sourceUrl); expect(data.get('note')).toBe('Updated evidence');
    expect(data.has('eventDate')).toBe(false); expect(data.has('eventType')).toBe(false);
    await view.render(<LifecycleWorkspace {...base} initialEventId="adopted" events={[adopted]} provisions={[provision]} />);
    expect(view.host.textContent).toContain('Some passage labels are unavailable');
  });

  it('keeps no-version and terminal states usable when optional preference storage is unavailable', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked'); });
    await render({ sourceVersionId: undefined, events: [{ ...adopted, eventType: 'repealed' }] });
    await click(button('Hide context pane')); expect(queryByRole(view.host, 'complementary')).toBeNull();
    await click(getByRole(view.host, 'radio', { name: /Selected provisions/ }));
    expect(getByRole(view.host, 'tabpanel').textContent).toContain('No published version');
    await click(tab('History')); await change(getByRole(view.host, 'combobox', { name: 'History', exact: true }), 'passages');
    expect(getByRole(view.host, 'tabpanel').textContent).toContain('No events recorded');
  });
});
