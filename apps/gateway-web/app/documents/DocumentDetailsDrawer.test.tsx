import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { fireEvent, getByLabelText, getByRole, queryByRole } from '@testing-library/dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { DocumentDetailsDrawer } from './DocumentDetailsDrawer';
import { TranslationProvider } from '../components/TranslationProvider';

let host: HTMLDivElement, root: Root;
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); });

it('preserves draft inputs across Escape/close and restores focus to its trigger', async () => {
  function Example() {
    const [open, setOpen] = useState(false);
    return <TranslationProvider locale="en"><button onClick={() => setOpen(true)}>Show details</button><DocumentDetailsDrawer id="details" open={open} title="Source" height={55} onHeightChange={() => {}} onClose={() => setOpen(false)}><input aria-label="Draft title" defaultValue="Original" /></DocumentDetailsDrawer></TranslationProvider>;
  }
  await act(async () => root.render(<Example />));
  const trigger = getByRole(host, 'button', { name: 'Show details' });
  trigger.focus();
  await act(async () => fireEvent.click(trigger));
  expect(document.activeElement).toBe(getByRole(host, 'button', { name: 'Close document details' }));
  const title = getByLabelText(host, 'Draft title') as HTMLInputElement;
  fireEvent.input(title, { target: { value: 'Unsaved title' } });
  await act(async () => fireEvent.keyDown(title, { key: 'Escape' }));
  expect(queryByRole(host, 'dialog')).toBeNull();
  expect(document.activeElement).toBe(trigger);
  await act(async () => fireEvent.click(trigger));
  expect((getByLabelText(host, 'Draft title') as HTMLInputElement).value).toBe('Unsaved title');
});

it('supports bounded keyboard resizing and lets select controls handle their own Escape', async () => {
  const resize = vi.fn(), close = vi.fn();
  await act(async () => root.render(<TranslationProvider locale="de"><DocumentDetailsDrawer id="details" open title="Quelle" height={55} onHeightChange={resize} onClose={close}><select aria-label="Typ"><option>Buch</option></select></DocumentDetailsDrawer></TranslationProvider>));
  const separator = getByRole(host, 'separator', { name: 'Größe der Dokumentdetails ändern' });
  fireEvent.keyDown(separator, { key: 'ArrowUp' });
  expect(resize).toHaveBeenLastCalledWith(60);
  fireEvent.keyDown(separator, { key: 'Home' });
  expect(resize).toHaveBeenLastCalledWith(25);
  fireEvent.keyDown(separator, { key: 'End' });
  expect(resize).toHaveBeenLastCalledWith(85);
  fireEvent.keyDown(getByRole(host, 'combobox'), { key: 'Escape' });
  expect(close).not.toHaveBeenCalled();
});
