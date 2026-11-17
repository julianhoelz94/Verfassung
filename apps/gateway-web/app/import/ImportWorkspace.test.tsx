import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { fireEvent, getByLabelText, getByRole, getByText, queryByRole } from '@testing-library/dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { TranslationProvider } from '../components/TranslationProvider';
import { ImportWorkspace } from './ImportWorkspace';
import { createImportAction, createSetupProposalAction } from '../admin/import/actions';
import type { ImportCollectionRow } from '../../lib/import-workspace';
vi.mock('../admin/import/actions', () => ({ createImportAction: vi.fn(), createSetupProposalAction: vi.fn() }));
const rows: ImportCollectionRow[] = [
  { id: 'job', kind: 'job', title: 'Basic Law', countryKey: 'DE', country: 'Germany', period: '2026', status: 'pending_review', href: '/import/jobs/job' },
  { id: 'run', kind: 'package', title: 'Historical charters', countryKey: 'DE', country: 'Germany', period: '', status: 'preparing', href: '/import/packages/run', prepared: 2, total: 5 },
];
let host: HTMLDivElement, root: Root;
const click = (role: 'button' | 'tab', name: string) => act(async () => { fireEvent.click(getByRole(host, role, { name, exact: true })); });
async function render(props: Partial<Parameters<typeof ImportWorkspace>[0]> = {}, locale: 'en' | 'de' = 'en') { await act(async () => root.render(<TranslationProvider locale={locale}><ImportWorkspace rows={rows} canImport unavailable={false} membershipUnavailable={false} {...props} /></TranslationProvider>)); }
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.mocked(createImportAction).mockReset().mockResolvedValue('/import?mode=existing&error=json');
  vi.mocked(createSetupProposalAction).mockReset().mockResolvedValue('/import?mode=new&error=proposal');
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); });
it('intersects live filters, supports removable chips, and restores focus on Escape', async () => {
  await render(); await click('button', 'Filters');
  await act(async () => { fireEvent.change(getByLabelText(host, 'Type'), { target: { value: 'package' } }); });
  expect(host.querySelectorAll('#imports-panel-queue li')).toHaveLength(1);
  await act(async () => { const field = getByLabelText(host, 'Type'); field.focus(); fireEvent.keyDown(field, { key: 'Escape' }); });
  expect(document.activeElement).toBe(getByRole(host, 'button', { name: 'Filters', exact: true }));
  await click('button', 'Remove filter: Packages'); expect(host.querySelectorAll('#imports-panel-queue li')).toHaveLength(2);
  await act(async () => { fireEvent.change(getByRole(host, 'searchbox'), { target: { value: 'no such charter' } }); });
  expect(getByRole(host, 'heading', { name: 'No matching imports' })).toBeTruthy();
  await click('button', 'Clear search and filters'); expect(host.querySelectorAll('#imports-panel-queue li')).toHaveLength(2);
});
it('retains file/JSON controls across task views, modes, context toggles and rejected server actions', async () => {
  await render(); await click('tab', 'New import');
  const input = host.querySelector<HTMLInputElement>('#upload input[type=file]')!;
  const json = host.querySelector<HTMLTextAreaElement>('#upload textarea')!;
  const file = new File(['{invalid'], 'retained.json', { type: 'application/json' });
  await act(async () => { fireEvent.change(input, { target: { files: [file] } }); fireEvent.change(json, { target: { value: '{unfinished' } }); });
  await click('button', 'Hide context'); await click('button', 'Show context');
  await click('tab', 'Overview'); await click('tab', 'New import');
  await act(async () => { fireEvent.click(getByRole(host, 'radio', { name: /New constitution/ })); });
  await act(async () => { fireEvent.click(getByRole(host, 'radio', { name: /Existing constitution/ })); });
  expect(host.querySelector('#upload input[type=file]')).toBe(input); expect(json.value).toBe('{unfinished');
  await act(async () => { fireEvent.submit(host.querySelector('#upload')!); });
  expect(getByRole(host, 'alert').textContent).toContain('not valid JSON');
  expect(vi.mocked(createImportAction).mock.calls[0][0].get('file')).toBe(file);
  expect(json.value).toBe('{unfinished'); expect(getByText(host, 'retained.json')).toBeTruthy();
  await click('button', 'Remove'); expect(queryByRole(host, 'status', { name: 'retained.json' })).toBeNull();
});
it('keeps upload unavailable to read-only reviewers and does not present an outage as no imports', async () => {
  await render({ canImport: false, rows: [], unavailable: true, membershipUnavailable: true });
  expect(queryByRole(host, 'tab', { name: 'New import' })).toBeNull(); expect(host.querySelector('input[type=file]')).toBeNull();
  expect(getByRole(host, 'heading', { name: 'Some work couldn’t be loaded' })).toBeTruthy();
  expect(host.textContent).not.toContain('No imports yet');
});

it('stages the new-structure contract independently and retains its JSON after rejection', async () => {
  await render({ initialMode: 'new' });
  const json = host.querySelector<HTMLTextAreaElement>('#structure textarea')!;
  await act(async () => { fireEvent.change(json, { target: { value: '{"constitutionTitle":"New charter"}' } }); fireEvent.submit(host.querySelector('#structure')!); });
  expect(vi.mocked(createSetupProposalAction).mock.calls[0][0].get('proposal')).toContain('New charter');
  expect(createImportAction).not.toHaveBeenCalled(); expect(json.value).toContain('New charter'); expect(getByRole(host, 'alert')).toBeTruthy();
});
it('prevents duplicate pending submissions and retains a dropped file after a service failure', async () => {
  let finish: ((value: string) => void) | undefined;
  vi.mocked(createImportAction).mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  await render({ initialMode: 'existing' });
  const input = host.querySelector<HTMLInputElement>('#upload input[type=file]')!;
  const file = new File(['{}'], 'dropped.json', { type: 'application/json' });
  await act(async () => { fireEvent.drop(input.parentElement!, { dataTransfer: { files: [file] } }); });
  await act(async () => { fireEvent.submit(host.querySelector('#upload')!); });
  await act(async () => { fireEvent.submit(host.querySelector('#upload')!); });
  expect(createImportAction).toHaveBeenCalledTimes(1); expect(vi.mocked(createImportAction).mock.calls[0][0].get('file')).toBe(file); expect((host.querySelector('#upload fieldset') as HTMLFieldSetElement).disabled).toBe(true);
  await act(async () => { finish!('/import?mode=existing&error=1'); });
  expect(getByText(host, 'dropped.json')).toBeTruthy(); expect((host.querySelector('#upload fieldset') as HTMLFieldSetElement).disabled).toBe(false);
});

it('keeps applied country identity stable when its translated caption changes', async () => {
  const item = { ...rows[1], countryKey: 'packages:unavailable', country: 'Packages' };
  await render({ rows: [item] }); await click('button', 'Filters');
  await act(async () => { fireEvent.change(getByLabelText(host, 'Country'), { target: { value: 'packages:unavailable' } }); });
  await render({ rows: [{ ...item, country: 'Pakete' }] }, 'de');
  expect(host.querySelectorAll('#imports-panel-queue li')).toHaveLength(1);
  expect(getByRole(host, 'button', { name: 'Filter entfernen: Pakete', exact: true })).toBeTruthy();
});

it('closes filters with Escape without clearing a query entered in the search field', async () => {
  await render(); await click('button', 'Filters');
  const search = getByRole(host, 'searchbox') as HTMLInputElement;
  await act(async () => { fireEvent.change(search, { target: { value: 'Basic' } }); search.focus(); fireEvent.keyDown(search, { key: 'Escape' }); });
  expect(search.value).toBe('Basic'); expect(host.querySelectorAll('#imports-panel-queue li')).toHaveLength(1);
  expect(document.activeElement).toBe(getByRole(host, 'button', { name: 'Filters', exact: true }));
});
