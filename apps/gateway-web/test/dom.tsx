import { act, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { Simulate } from 'react-dom/test-utils';

export async function mount(element: ReactNode) {
  const host = document.createElement('div'); document.body.append(host);
  const root = createRoot(host);
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  await act(async () => root.render(element));
  return {
    host,
    async render(next: ReactNode) { await act(async () => root.render(next)); },
    async close() { await act(async () => root.unmount()); host.remove(); },
  };
}
export async function click(element: Element) { await act(async () => (element as HTMLElement).click()); }
export function button(host: Element, text: string): HTMLButtonElement {
  const found = [...host.querySelectorAll<HTMLButtonElement>('button')].find(item => item.textContent?.trim() === text);
  if (!found) throw new Error('Missing button: ' + text);
  return found;
}
export async function change(element: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement, value: string) {
  await act(async () => { element.value = value; Simulate.change(element); });
}
