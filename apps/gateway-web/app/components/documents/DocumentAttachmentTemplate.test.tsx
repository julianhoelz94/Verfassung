import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { fireEvent, getByLabelText, getByRole, getByText, queryByRole } from '@testing-library/dom';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import type { DocumentRecord } from '../../../lib/document-api';
import { DocumentAttachmentTemplate, type DocumentAttachmentTemplateProps } from './DocumentAttachmentTemplate';

let host: HTMLDivElement, root: Root;
const create = vi.fn(), attach = vi.fn(), submitHost = vi.fn();
const document: DocumentRecord = { id: 'source', citationKey: 'Law2026', currentRevision: 1, status: 'active', createdAt: '2026-01-01', tags: [{ id: 'project-tag', name: 'Research' }], revision: { id: 'pin-1', documentId: 'source', revision: 1, title: 'Sample law', fileName: null, contentType: null, description: null, sourceUrl: null, createdAt: '2026-01-01', createdBy: 'editor' } };
const click = (name: string) => act(async () => { fireEvent.click(getByRole(host, 'button', { name, exact: true })); });
const fill = (name: string, value: string) => act(async () => { fireEvent.change(getByLabelText(host, name, { exact: true }), { target: { value } }); });
const disclose = (name: string) => act(async () => { fireEvent.click(getByText(host, name, { selector: 'summary', exact: true })); });
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  create.mockReset().mockResolvedValue(false); attach.mockReset().mockResolvedValue(false); submitHost.mockReset();
  host = window.document.createElement('div'); window.document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); });
async function render(props: Partial<DocumentAttachmentTemplateProps> = {}) {
  await act(async () => root.render(<form id="host-form" onSubmit={event => { event.preventDefault(); submitHost(); }}>
    <DocumentAttachmentTemplate links={[]} documents={[document]} revisions={{}} canEdit pending={false} onCreate={create} onAttach={attach} onDetach={async () => false} {...props} />
    <button type="submit">Save parent</button>
  </form>));
}

it('keeps document controls and validation independent of the surrounding form', async () => {
  await render(); await click('Upload new document');
  expect(host.querySelectorAll('form')).toHaveLength(1);
  expect((getByLabelText(host, 'Title', { exact: true }) as HTMLInputElement).form).toBeNull();
  expect(host.querySelector('form')!.reportValidity()).toBe(true);
  await click('Save parent'); expect(submitHost).toHaveBeenCalledTimes(1);
  expect(host.querySelector('details')!.open).toBe(false);
  await disclose('Optional details'); await fill('Title', 'A legal source'); await fill('Source URL', 'https://example.org/source');
  await act(async () => { fireEvent.keyDown(getByLabelText(host, 'Title', { exact: true }), { key: 'Enter' }); });
  expect(create).toHaveBeenCalledTimes(1); expect(submitHost).toHaveBeenCalledTimes(1);
  expect((getByLabelText(host, 'Title', { exact: true }) as HTMLInputElement).value).toBe('A legal source');
  await click('Choose existing document');
  expect((getByLabelText(host, 'Search documents', { exact: true }) as HTMLInputElement).form).toBeNull();
  expect(host.querySelector('form')!.reportValidity()).toBe(true);
});

it('serializes complete optional metadata and retains it after a rejected creation', async () => {
  await render(); await click('Upload new document'); await fill('Title', 'Full citation');
  await disclose('Optional details'); await fill('Source URL', 'https://example.org/source'); await fill('Citation key', 'Smith2026'); await fill('Item type', 'book');
  await disclose('Creators'); await click('Add author'); await fill('Family name', 'Smith'); await fill('Given names', 'Jane');
  await disclose('Publication details'); await fill('Year or publication date', '2026'); await fill('DOI', '10.1000/sample'); await fill('Abstract', 'Source summary');
  await disclose('Additional bibliography fields'); await click('Add field'); await fill('Field name', 'jurisdiction'); await fill('Value', 'Germany');
  await click('Create and attach');
  const data = create.mock.calls[0][0] as FormData;
  expect(data.get('citationKey')).toBe('Smith2026');
  expect(JSON.parse(String(data.get('bibliography')))).toMatchObject({ type: 'book', authors: [{ family: 'Smith', given: 'Jane' }], editors: [], issued: '2026', doi: '10.1000/sample', abstract: 'Source summary', extra: { jurisdiction: 'Germany' } });
  expect(data.get('targetType')).toBeNull(); expect(submitHost).not.toHaveBeenCalled();
  expect((getByLabelText(host, 'Citation key', { exact: true }) as HTMLInputElement).value).toBe('Smith2026');
  for (const field of host.querySelectorAll<HTMLInputElement>('input,select,textarea')) expect(field.form).toBeNull();
  await click('Choose existing document'); await click('Upload new document');
  expect((getByLabelText(host, 'DOI', { exact: true }) as HTMLInputElement).value).toBe('10.1000/sample');
});

it('supports a host that permits attachment selection but not library creation', async () => {
  const search = vi.fn().mockResolvedValue(true), select = vi.fn().mockResolvedValue(undefined);
  await render({ canCreate: false, onSearch: search, onSelect: select, folders: [{ id: 'project', tagId: 'project-tag', name: 'Research' }] });
  expect(queryByRole(host, 'button', { name: 'Upload new document' })).toBeNull();
  await click('Choose existing document'); await fill('Project folder', 'project'); await act(async () => { await new Promise(resolve => setTimeout(resolve, 300)); });
  expect(search).toHaveBeenCalledWith('', 0, 'project');
  await act(async () => { fireEvent.click(getByRole(host, 'option', { name: /^Sample law/ })); }); await click('Attach document');
  expect(attach).toHaveBeenCalledWith('source', 'pin-1');
  expect((getByLabelText(host, 'Search documents', { exact: true }) as HTMLInputElement).value).toBe('Sample law');
  expect(create).not.toHaveBeenCalled(); expect(submitHost).not.toHaveBeenCalled();
});

it('keeps the dropdown visible during immediate searches and selects the replacement results with the keyboard', async () => {
  const completions: ((ok: boolean) => void)[] = [];
  const search = vi.fn(() => new Promise<boolean>(resolve => completions.push(resolve))), select = vi.fn().mockResolvedValue(undefined);
  await render({ onSearch: search, onSelect: select }); await click('Choose existing document');
  const input = getByRole(host, 'combobox', { name: 'Search documents', exact: true });
  await act(async () => { input.focus(); });
  const dropdown = getByRole(host, 'listbox'), option = getByRole(host, 'option', { name: /^Sample law/ });
  await fill('Search documents', 'Sam'); await fill('Search documents', 'Later');
  expect(search).toHaveBeenCalledTimes(2); expect(search).toHaveBeenLastCalledWith('Later', 0, undefined);
  expect(getByRole(host, 'listbox')).toBe(dropdown); expect(getByRole(host, 'option', { name: /^Sample law/ })).toBe(option);
  expect(input.getAttribute('aria-expanded')).toBe('true'); expect(dropdown.getAttribute('aria-busy')).toBe('true');
  expect(getByRole(host, 'status').textContent).toBe('1 matching documents');
  const later = { ...document, id: 'later', revision: { ...document.revision, id: 'later-pin', documentId: 'later', title: 'Later source' } };
  await render({ documents: [later], onSearch: search, onSelect: select });
  await act(async () => { completions[1](true); completions[0](false); });
  expect(getByRole(host, 'listbox')).toBe(dropdown); expect(dropdown.getAttribute('aria-busy')).toBe('false');
  expect(queryByRole(host, 'option', { name: /^Sample law/ })).toBeNull(); expect(getByRole(host, 'option', { name: /^Later source/ })).toBeTruthy();
  expect(getByRole(host, 'status').textContent).toBe('1 matching documents');
  await act(async () => { fireEvent.keyDown(input, { key: 'ArrowDown' }); fireEvent.keyDown(input, { key: 'Enter' }); });
  expect(select).toHaveBeenLastCalledWith('later'); expect(attach).not.toHaveBeenCalled(); expect(submitHost).not.toHaveBeenCalled();
  expect(input.getAttribute('aria-expanded')).toBe('false'); expect(search).toHaveBeenCalledTimes(2);
  expect(queryByRole(host, 'button', { name: 'Search library' })).toBeNull();
  expect(queryByRole(host, 'combobox', { name: 'Document', exact: true })).toBeNull();
  expect(getByRole(host, 'button', { name: 'Choose existing document', exact: true }).getAttribute('aria-pressed')).toBe('true');
});

it('retains a document chosen while search is refreshing even if the replacement page omits it', async () => {
  let finish!: (ok: boolean) => void;
  const search = vi.fn(() => new Promise<boolean>(resolve => { finish = resolve; }));
  await render({ onSearch: search }); await click('Choose existing document'); await fill('Search documents', 'Another source');
  await act(async () => { fireEvent.click(getByRole(host, 'option', { name: /^Sample law/ })); });
  expect((getByRole(host, 'button', { name: 'Attach document', exact: true }) as HTMLButtonElement).disabled).toBe(false);
  await render({ documents: [], onSearch: search }); await act(async () => { finish(true); });
  expect((getByLabelText(host, 'Search documents', { exact: true }) as HTMLInputElement).value).toBe('Sample law');
  await click('Attach document'); expect(attach).toHaveBeenCalledWith('source', 'pin-1'); expect(submitHost).not.toHaveBeenCalled();
});
