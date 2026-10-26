import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { fireEvent } from '@testing-library/dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HistoryTimeline } from './HistoryTimeline';

describe('keyboard history previews during scrolling', () => {
  let host: HTMLElement;
  let root: Root;
  let markerTop: number;
  let markerLeft: number;
  const originalScroll = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollIntoView');
  beforeEach(async () => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    window.history.replaceState(null, '', '/');
    markerTop = 130;
    markerLeft = 80;
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function () {
      return this.classList.contains('history-rail') ? new DOMRect(10, 100, 600, 100) : new DOMRect(markerLeft, markerTop, 28, 28);
    });
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { configurable: true, value: vi.fn() });
    host = document.createElement('main');
    document.body.append(host);
    root = createRoot(host);
    await act(async () => root.render(<HistoryTimeline items={[
      { kind: 'constitution', id: 'first', date: '1949-05-23', title: 'First event', content: <p>First detail</p> },
      { kind: 'amendment', id: 'last', date: '2026-01-01', title: 'Last event', content: <p>Last detail</p> },
    ]} />));
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    host.remove();
    vi.restoreAllMocks();
    if (originalScroll) Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', originalScroll);
    else Reflect.deleteProperty(HTMLElement.prototype, 'scrollIntoView');
  });
  function rail() { return host.querySelector<HTMLElement>('.history-rail')!; }
  function marker(index: number) { return host.querySelectorAll<HTMLButtonElement>('.history-milestone')[index]; }
  function preview() { return host.querySelector<HTMLElement>('[role="tooltip"]'); }
  async function navigate(key: string) {
    await act(async () => marker(key === 'End' ? 0 : 1).focus());
    await act(async () => fireEvent.keyDown(rail(), { key }));
  }
  async function scroll() { await act(async () => rail().dispatchEvent(new Event('scroll'))); }

  it.each([['End', 1], ['Home', 0]] as const)('keeps the %s marker selected, focused and described after queued scroll', async (key, index) => {
    await navigate(key);
    const top = preview()!.style.top;
    markerTop += 20;
    await scroll();
    expect(document.activeElement).toBe(marker(index));
    expect(marker(index).getAttribute('aria-pressed')).toBe('true');
    expect(marker(index).getAttribute('aria-describedby')).toBe(preview()!.id);
    expect(preview()!.textContent).toContain(index ? 'Last event' : 'First event');
    expect(preview()!.style.top).not.toBe(top);
  });

  it('keeps an escaped preview closed when the queued scroll arrives', async () => {
    await navigate('End');
    await act(async () => fireEvent.keyDown(rail(), { key: 'Escape' }));
    await scroll();
    expect(document.activeElement).toBe(marker(1));
    expect(preview()).toBeNull();
  });

  it.each(['page', 'rail'])('dismisses the preview when the anchor scrolls out of the %s', async area => {
    await navigate('End');
    if (area === 'page') markerTop = -100;
    else markerLeft = 700;
    await scroll();
    expect(preview()).toBeNull();
  });

  it('dismisses pointer-only previews on scroll', async () => {
    await act(async () => fireEvent.pointerOver(marker(0), { pointerType: 'mouse' }));
    expect(preview()).not.toBeNull();
    await scroll();
    expect(preview()).toBeNull();
  });
});
