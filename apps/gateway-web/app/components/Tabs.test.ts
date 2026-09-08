import { act } from 'react';
import { createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Tabs } from './Tabs';

describe('Tabs', () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    host.remove();
  });

  it('exposes a tablist and reports the selected tab', async () => {
    const seen: string[] = [];
    await act(async () => {
      root.render(
        createElement(Tabs, {
          ariaLabel: 'Compare view',
          controlsId: 'compare-tab-panels',
          value: 'changes',
          tabs: [
            { id: 'changes', label: 'Changes' },
            { id: 'from', label: '1949' },
            { id: 'to', label: '2022' },
          ],
          onChange: (id: string) => {
            seen.push(id);
          },
        }),
      );
    });
    const list = host.querySelector('[role="tablist"]');
    expect(list?.getAttribute('aria-label')).toBe('Compare view');
    const buttons = host.querySelectorAll('[role="tab"]');
    expect(buttons[0]?.getAttribute('aria-selected')).toBe('true');
    expect(buttons[1]?.getAttribute('aria-selected')).toBe('false');
    await act(async () => {
      (buttons[1] as HTMLButtonElement | undefined)?.click();
    });
    expect(seen).toEqual(['from']);
  });
});
