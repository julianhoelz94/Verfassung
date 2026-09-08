import { act } from 'react';
import { createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MenuDisclosure } from './MenuDisclosure';

describe('MenuDisclosure', () => {
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

  it('opens, closes on Escape, and returns focus to the trigger', async () => {
    await act(async () => {
      root.render(
        createElement(
          MenuDisclosure,
          { label: 'Account menu', trigger: 'Open' },
          createElement('a', { href: '/account' }, 'Account'),
        ),
      );
    });
    const button = host.querySelector('button');
    expect(button).not.toBeNull();
    await act(async () => {
      button?.click();
    });
    expect(host.querySelector('.menu-panel')).not.toBeNull();
    expect(button?.getAttribute('aria-expanded')).toBe('true');
    await act(async () => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    expect(host.querySelector('.menu-panel')).toBeNull();
    expect(document.activeElement).toBe(button);
  });

  it('closes when a pointer lands outside the panel', async () => {
    await act(async () => {
      root.render(
        createElement(
          MenuDisclosure,
          { label: 'Menu', trigger: 'Open' },
          createElement('a', { href: '/login' }, 'Log in'),
        ),
      );
    });
    const button = host.querySelector('button');
    await act(async () => {
      button?.click();
    });
    expect(host.querySelector('.menu-panel')).not.toBeNull();
    await act(async () => {
      document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    });
    expect(host.querySelector('.menu-panel')).toBeNull();
  });
});
