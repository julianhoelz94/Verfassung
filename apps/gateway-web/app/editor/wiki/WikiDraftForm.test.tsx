import { act, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { fireEvent, getByRole } from '@testing-library/dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { EditorDraftState, useDraftState } from '../EditorDraftState';
import { WikiDraftForm } from './WikiDraftForm';

let host: HTMLDivElement, root: ReturnType<typeof createRoot>;
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); });
function DirtyText() { const { setDirty } = useDraftState(); useEffect(() => { setDirty(true); }, [setDirty]); return null; }
async function mount(action: (data: FormData) => Promise<string>, dirty = false) {
  await act(async () => root.render(<EditorDraftState>{dirty ? <DirtyText /> : null}<WikiDraftForm embedded action={action}><textarea aria-label="Wiki body" name="body" defaultValue="Saved wording" /><button type="submit">Save Wiki draft</button></WikiDraftForm></EditorDraftState>));
}
it('retains typed Wiki content after a conflicting or failed server save', async () => {
  const action = vi.fn().mockResolvedValue('/editor?sessionId=session&versionId=version&tab=wiki&wikiStatus=error'); await mount(action);
  const field = getByRole(host, 'textbox') as HTMLTextAreaElement;
  await act(async () => fireEvent.change(field, { target: { value: 'Unsaved context' } }));
  await act(async () => fireEvent.submit(host.querySelector('form')!));
  expect(action).toHaveBeenCalledOnce(); expect((action.mock.calls[0][0] as FormData).get('body')).toBe('Unsaved context');
  expect(field.value).toBe('Unsaved context'); expect(getByRole(host, 'alert').textContent).toContain('Your entries are still here');
  expect(host.querySelector('fieldset')?.disabled).toBe(false);
  const event = new Event('beforeunload', { cancelable: true }); window.dispatchEvent(event); expect(event.defaultPrevented).toBe(true);
});
it('blocks independent Wiki navigation while the constitutional text has unsaved changes', async () => {
  const action = vi.fn(); await mount(action, true);
  await act(async () => fireEvent.submit(host.querySelector('form')!));
  expect(action).not.toHaveBeenCalled(); expect(getByRole(host, 'status').textContent).toContain('Save your text');
});
it('preserves editable data and restores controls if the action throws', async () => {
  await mount(vi.fn().mockRejectedValue(new Error('network failed')));
  await act(async () => fireEvent.submit(host.querySelector('form')!));
  expect(getByRole(host, 'alert').textContent).not.toContain('network failed'); expect(host.querySelector('fieldset')?.disabled).toBe(false);
  expect((getByRole(host, 'textbox') as HTMLTextAreaElement).value).toBe('Saved wording');
});
