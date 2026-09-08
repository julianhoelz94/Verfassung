import { act } from 'react';
import { createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Segmented } from './Segmented';

describe('Segmented', () => {
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

  it('marks the selected option and reports a new value', async () => {
    const seen: number[] = [];
    await act(async () => {
      root.render(
        createElement(Segmented, {
          labels: ['Overview', 'Full text'],
          value: 1,
          ariaLabel: 'Detail level',
          onChange: (value: number) => {
            seen.push(value);
          },
        }),
      );
    });
    const buttons = host.querySelectorAll('button');
    expect(buttons[0]?.getAttribute('aria-pressed')).toBe('true');
    expect(buttons[1]?.getAttribute('aria-pressed')).toBe('false');
    await act(async () => {
      buttons[1]?.click();
    });
    expect(seen).toEqual([2]);
  });
});
