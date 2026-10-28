import { act } from 'react';
import { createRoot, hydrateRoot, type Root } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { fireEvent } from '@testing-library/dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { COOKIE_NOTICE_KEY, CookieSettings } from './CookieSettings';

let host: HTMLDivElement;
let root: Root | null;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  localStorage.clear();
  host = document.createElement('div');
  document.body.appendChild(host);
  root = null;
});

afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  host.remove();
  vi.restoreAllMocks();
  localStorage.clear();
});

const notice = () => host.querySelector('section.cookie-notice');

it('hydrates the notice, remembers dismissal across remount and lets the visitor reopen it', async () => {
  host.innerHTML = renderToString(<CookieSettings />);
  expect(notice()).toBeNull();
  await act(async () => { root = hydrateRoot(host, <CookieSettings />); });
  expect(notice()).not.toBeNull();
  expect(notice()!.querySelector('a[href="/datenschutz"]')).not.toBeNull();
  expect(notice()!.querySelector('a[href="/impressum"]')).not.toBeNull();
  await act(async () => { fireEvent.click(notice()!.querySelector('button')!); });
  expect(notice()).toBeNull();
  expect(localStorage.getItem(COOKIE_NOTICE_KEY)).toBe('dismissed');
  await act(async () => root!.unmount());
  await act(async () => { root = createRoot(host); root.render(<CookieSettings />); });
  expect(notice()).toBeNull();
  await act(async () => { fireEvent.click(host.querySelector('button')!); });
  expect(notice()).not.toBeNull();
});

it('reflects another tab dismissal and removes its storage subscription on unmount', async () => {
  const remove = vi.spyOn(window, 'removeEventListener');
  await act(async () => { root = createRoot(host); root.render(<CookieSettings />); });
  expect(notice()).not.toBeNull();
  await act(async () => {
    localStorage.setItem(COOKIE_NOTICE_KEY, 'dismissed');
    window.dispatchEvent(new StorageEvent('storage', { key: COOKIE_NOTICE_KEY }));
  });
  expect(notice()).toBeNull();
  await act(async () => {
    localStorage.removeItem(COOKIE_NOTICE_KEY);
    window.dispatchEvent(new StorageEvent('storage', { key: COOKIE_NOTICE_KEY }));
  });
  expect(notice()).not.toBeNull();
  await act(async () => root!.unmount());
  root = null;
  expect(remove.mock.calls.some(([event]) => event === 'storage')).toBe(true);
});

it('allows dismissal and reopening when browser storage is unavailable', async () => {
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('Storage disabled'); });
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('Storage disabled'); });
  await act(async () => { root = createRoot(host); root.render(<CookieSettings />); });
  expect(notice()).not.toBeNull();
  await act(async () => { fireEvent.click(notice()!.querySelector('button')!); });
  expect(notice()).toBeNull();
  await act(async () => { fireEvent.click(host.querySelector('button')!); });
  expect(notice()).not.toBeNull();
});
