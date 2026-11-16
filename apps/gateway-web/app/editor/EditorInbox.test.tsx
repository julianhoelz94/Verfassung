import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { fireEvent, getAllByRole, getByLabelText, getByRole, queryByRole } from '@testing-library/dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { emptyInboxFilters, type InboxFilters, type InboxRow } from '../../lib/editor-inbox';
import { EditorDeskFrame } from './EditorDeskFrame';
import { EditorInbox } from './EditorInbox';
import { manageWorkAction } from './work-actions';

vi.mock('./work-actions', () => ({ manageWorkAction: vi.fn(async () => '/editor?mine=1') }));

const roles = ['editor', 'reviewer', 'publisher'];
const draft: InboxRow = { id: 'draft', kind: 'correction', status: 'open', owned: true, countryKey: 'DE', country: 'Germany', constitutionKey: 'basic-law', constitution: 'Basic Law', version: '1949', updatedAt: '2026-01-02T00:00:00Z', workspaceHref: '/editor?sessionId=draft&versionId=source', publicHref: '/countries/DE/versions/source' };
const rows: InboxRow[] = [draft, { ...draft, id: 'review', kind: 'legal', status: 'reviewing', countryKey: 'FR', country: 'France', constitutionKey: 'fifth-republic', constitution: 'Fifth Republic', version: '1958' }, { ...draft, id: 'import', kind: 'import', status: 'approved', version: '2022' }];
function inbox(items = rows, filters: InboxFilters = emptyInboxFilters) {
  return <EditorInbox userId="author" roles={roles} queue="mine" rows={items} counts={{ mine: items.length, reviewing: 1, approved: 1 }} initialFilters={filters} sessionsUnavailable={false} importsUnavailable={false} />;
}

describe('editor inbox interactions', () => {
  let host: HTMLDivElement, root: Root;
  const originalShowModal = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, 'showModal');
  const originalScroll = Object.getOwnPropertyDescriptor(window, 'scrollY');
  const preventNavigation = (event: MouseEvent) => { if ((event.target as Element).closest('a')) event.preventDefault(); };
  async function mount(node: ReactNode) { await act(async () => root.render(node)); }
  async function remount(node: ReactNode) { await act(async () => root.unmount()); root = createRoot(host); await mount(node); }
  async function click(element: HTMLElement) { await act(async () => fireEvent.click(element)); }
  async function change(element: HTMLElement, value: string) { await act(async () => fireEvent.change(element, { target: { value } })); }

  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    sessionStorage.clear();
    vi.clearAllMocks();
    history.replaceState({}, '', '/editor');
    vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { callback(0); return 1; });
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    Object.defineProperty(HTMLDialogElement.prototype, 'showModal', { configurable: true, value: function (this: HTMLDialogElement) { this.setAttribute('open', ''); } });
    host = document.createElement('div'); document.body.append(host); root = createRoot(host);
    document.addEventListener('click', preventNavigation);
  });
  afterEach(async () => {
    await act(async () => root.unmount()); host.remove();
    document.removeEventListener('click', preventNavigation);
    vi.restoreAllMocks(); vi.unstubAllGlobals(); sessionStorage.clear();
    if (originalShowModal) Object.defineProperty(HTMLDialogElement.prototype, 'showModal', originalShowModal);
    else Reflect.deleteProperty(HTMLDialogElement.prototype, 'showModal');
    if (originalScroll) Object.defineProperty(window, 'scrollY', originalScroll);
    history.replaceState({}, '', '/');
  });

  it('combines immediate filters, removable chips and search without losing the complete work list', async () => {
    await mount(inbox());
    expect(host.querySelectorAll('[data-work-id]')).toHaveLength(3);
    const filters = getByRole(host, 'button', { name: 'Filters' });
    await click(filters);
    await change(getByRole(host, 'combobox', { name: 'Status' }), 'reviewing');
    await change(getByRole(host, 'combobox', { name: 'Country' }), 'FR');
    await change(getByRole(host, 'combobox', { name: 'Work type' }), 'legal');
    expect(host.querySelectorAll('[data-work-id]')).toHaveLength(1);
    expect(getByRole(host, 'link', { name: 'View progress' })).toBeTruthy();
    expect(new URLSearchParams(location.search).get('country')).toBe('FR');
    expect(new URLSearchParams(location.search).get('kind')).toBe('legal');
    await click(getAllByRole(host, 'button', { name: /^Remove filter:/ })[0]);
    expect(new URLSearchParams(location.search).has('workStatus')).toBe(false);
    const search = getByRole(host, 'searchbox', { name: 'Search your work' });
    await change(search, 'no matching charter');
    expect(getByRole(host, 'heading', { name: 'No matching work' })).toBeTruthy();
    await click(getByRole(host, 'button', { name: 'Clear search and filters' }));
    expect((search as HTMLInputElement).value).toBe('');
    expect(host.querySelectorAll('[data-work-id]')).toHaveLength(3);
    await click(filters);
    await act(async () => fireEvent.keyDown(getByRole(host, 'region', { name: 'Filters' }), { key: 'Escape' }));
    expect(document.activeElement).toBe(filters);
    expect(filters.getAttribute('aria-expanded')).toBe('false');
  });

  it('restores expanded results, invoking focus and a work-specific return link without sharing it across accounts', async () => {
    Object.defineProperty(window, 'scrollY', { configurable: true, value: 321 });
    const many = Array.from({ length: 51 }, (_, index) => ({ ...draft, id: `draft-${index}`, workspaceHref: `/editor?sessionId=draft-${index}&versionId=source` }));
    await mount(inbox(many));
    await change(getByRole(host, 'searchbox', { name: 'Search your work' }), '1949');
    await click(getByRole(host, 'button', { name: 'Show 20 more' }));
    await click(getByRole(host, 'button', { name: 'Show 20 more' }));
    await click(getAllByRole(host, 'link', { name: 'Continue editing' })[50]);
    await remount(inbox(many, { ...emptyInboxFilters, query: '1949' }));
    expect(host.querySelectorAll('[data-work-id]')).toHaveLength(51);
    expect(document.activeElement).toBe(getAllByRole(host, 'link', { name: 'Continue editing' })[50]);
    expect(window.scrollTo).toHaveBeenCalledWith(0, 321);
    await remount(<EditorDeskFrame compact userId="author" roles={roles} title="Saved work" workKey="session:draft-50">Document</EditorDeskFrame>);
    expect(getByRole(host, 'link', { name: 'Back to My work' }).getAttribute('href')).toBe('/editor?mine=1&query=1949');
    await remount(<EditorDeskFrame compact userId="another-author" roles={roles} title="Other work" workKey="session:draft-50">Document</EditorDeskFrame>);
    expect(getByRole(host, 'link', { name: 'Back to My work' }).getAttribute('href')).toBe('/editor?mine=1');
  });

  it('retains hidden context fields, supports queue keyboard navigation and tolerates unavailable storage', async () => {
    await mount(<EditorDeskFrame compact userId="author" roles={roles} title="Draft" workKey="session:draft" context={<input aria-label="Rationale" defaultValue="Saved" />}>Document</EditorDeskFrame>);
    const field = getByLabelText(host, 'Rationale') as HTMLInputElement;
    field.value = 'Unsaved explanation';
    const context = getByRole(host, 'complementary', { name: 'Work context' });
    await click(getByRole(host, 'button', { name: 'Hide context' }));
    expect(context.hidden).toBe(true);
    await click(getByRole(host, 'button', { name: 'Show context' }));
    expect(getByLabelText(host, 'Rationale')).toBe(field);
    expect(field.value).toBe('Unsaved explanation');
    const queues = getByRole(host, 'navigation', { name: 'Work queues' }), links = getAllByRole(queues, 'link');
    links[0].focus();
    for (const [key, index] of [['ArrowLeft', 2], ['Home', 0], ['End', 2], ['ArrowRight', 0]] as const) {
      await act(async () => fireEvent.keyDown(queues, { key }));
      expect(document.activeElement).toBe(links[index]);
    }
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('Storage unavailable'); });
    await remount(<EditorDeskFrame compact userId="author" roles={['publisher']} title="Publication" workKey="session:draft" returnTo="https://example.test/invalid">Document</EditorDeskFrame>);
    expect(getByRole(host, 'link', { name: 'Back to Ready to publish' }).getAttribute('href')).toBe('/editor?status=approved');
  });

  it('requires a separate discard confirmation and returns focus without executing a canceled deletion', async () => {
    await mount(inbox([draft]));
    const more = getByRole(host, 'button', { name: /^More actions:/ });
    await click(more);
    await click(getByRole(host, 'menuitem', { name: 'Delete draft' }));
    const dialog = getByRole(host, 'dialog', { name: 'Discard this draft?' });
    expect(getByRole(dialog, 'button', { name: 'Confirm deletion' })).toBeTruthy();
    expect(manageWorkAction).not.toHaveBeenCalled();
    await click(getByRole(dialog, 'button', { name: 'Cancel' }));
    expect(queryByRole(host, 'dialog')).toBeNull();
    expect(document.activeElement).toBe(more);
    expect(getByRole(host, 'link', { name: 'Continue editing' })).toBeTruthy();
    expect(manageWorkAction).not.toHaveBeenCalled();
  });
});
