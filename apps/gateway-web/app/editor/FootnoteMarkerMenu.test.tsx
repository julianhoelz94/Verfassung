import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { fireEvent, getByRole } from '@testing-library/dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { FootnoteMarkerMenu } from './FootnoteMarkerMenu';
import { TranslationProvider } from '../components/TranslationProvider';

let host: HTMLDivElement, root: Root, trigger: HTMLButtonElement;
const callbacks = { onEdit: vi.fn(), onMove: vi.fn(), onRemove: vi.fn(), onNavigate: vi.fn(), onClose: vi.fn() };
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.clearAllMocks();
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
  trigger = document.createElement('button'); trigger.textContent = '1'; document.body.append(trigger);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); trigger.remove(); vi.restoreAllMocks(); });
async function mount(x = 40, y = 60, locale: 'en' | 'de' = 'en') {
  await act(async () => root.render(<TranslationProvider locale={locale}><FootnoteMarkerMenu anchor={{ x, y, trigger }} label="1" {...callbacks} /></TranslationProvider>));
}
it.each([['Edit footnote', 'onEdit'], ['Move marker…', 'onMove'], ['Remove marker', 'onRemove'], ['Go to footnote', 'onNavigate']] as const)('dispatches %s without following a marker link', async (name, callback) => {
  await mount(); await act(async () => fireEvent.click(getByRole(document.body, 'menuitem', { name })));
  expect(callbacks[callback]).toHaveBeenCalledOnce(); expect(callbacks.onClose).toHaveBeenCalledOnce(); expect(document.activeElement).toBe(trigger);
});
it('supports roving keyboard focus, wrapping and Escape with focus restoration', async () => {
  await mount();
  const items = Array.from(document.querySelectorAll('[role=menuitem]'));
  expect(document.activeElement).toBe(items[0]);
  fireEvent.keyDown(document.activeElement!, { key: 'ArrowUp' }); expect(document.activeElement).toBe(items[3]);
  fireEvent.keyDown(document.activeElement!, { key: 'ArrowDown' }); expect(document.activeElement).toBe(items[0]);
  fireEvent.keyDown(document.activeElement!, { key: 'End' }); expect(document.activeElement).toBe(items[3]);
  fireEvent.keyDown(document.activeElement!, { key: 'Home' }); expect(document.activeElement).toBe(items[0]);
  const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }); document.activeElement!.dispatchEvent(event);
  expect(event.defaultPrevented).toBe(true); expect(callbacks.onClose).toHaveBeenCalledOnce(); expect(document.activeElement).toBe(trigger);
});
it('dismisses on outside press, Tab or resize, while an inside press leaves the menu open', async () => {
  await mount();
  fireEvent.pointerDown(getByRole(document.body, 'menu')); expect(callbacks.onClose).not.toHaveBeenCalled();
  fireEvent.pointerDown(document.body); expect(callbacks.onClose).toHaveBeenCalledTimes(1);
  fireEvent.keyDown(document.body, { key: 'Tab' }); expect(callbacks.onClose).toHaveBeenCalledTimes(2);
  fireEvent(window, new Event('resize')); expect(callbacks.onClose).toHaveBeenCalledTimes(3);
});
it('clamps the portal to the viewport instead of clipping it inside the document canvas', async () => {
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ width: 220, height: 170, x: 0, y: 0, top: 0, left: 0, bottom: 170, right: 220, toJSON() {} });
  await mount(window.innerWidth + 100, window.innerHeight + 100);
  const menu = getByRole(document.body, 'menu');
  expect(menu.style.left).toBe(window.innerWidth - 220 - 8 + 'px'); expect(menu.style.top).toBe(window.innerHeight - 170 - 8 + 'px');
  expect(host.contains(menu)).toBe(false);
});
it('localizes the editing actions and tolerates a removed trigger on close', async () => {
  await mount(-100, -100, 'de'); trigger.remove();
  expect(getByRole(document.body, 'menu', { name: 'Fußnote 1' }).style.left).toBe('8px');
  expect(getByRole(document.body, 'menuitem', { name: 'Verweiszeichen verschieben…' })).not.toBeNull();
  fireEvent.keyDown(document.body, { key: 'Escape' }); expect(callbacks.onClose).toHaveBeenCalledOnce();
});
