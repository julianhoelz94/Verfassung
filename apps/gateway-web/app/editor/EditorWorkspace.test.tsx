import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { fireEvent, getByRole } from '@testing-library/dom';
import { expect, it } from 'vitest';
import { EditorNavigationToggle, EditorWorkspace } from './EditorWorkspace';

it('reclaims navigation width without remounting unsaved document fields and keeps session details disclosed on demand', async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  localStorage.clear();
  const host = document.createElement('div'); document.body.appendChild(host); const root = createRoot(host);
  await act(async () => root.render(<EditorWorkspace navigation={<nav>Article 1</nav>} session={<aside>Publication controls</aside>}><input aria-label="Draft" defaultValue="Original" /></EditorWorkspace>));
  const field = host.querySelector('input')!; field.value = 'Unsaved wording';
  expect(host.querySelector('[hidden]')?.textContent).toContain('Article 1');
  expect(host.querySelector('details')?.open).toBe(false);
  await act(async () => fireEvent.click(getByRole(host, 'button', { name: 'Show article navigation' })));
  expect(host.querySelector('[data-navigation="shown"]')).not.toBeNull();
  expect(localStorage.getItem('atlas-editor-navigation')).toBe('shown');
  await act(async () => fireEvent.click(getByRole(host, 'button', { name: 'Hide article navigation' })));
  expect(host.querySelector('input')).toBe(field);
  expect(field.value).toBe('Unsaved wording');
  await act(async () => root.unmount()); host.remove();
  localStorage.clear();
});

it('restores the explicit navigation view preference on a new page', async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  localStorage.setItem('atlas-editor-navigation', 'shown');
  const host = document.createElement('div'); document.body.append(host); const root = createRoot(host);
  await act(async () => root.render(<EditorWorkspace navigation={<nav>Article 20</nav>} session={<aside>Publication</aside>}>Document</EditorWorkspace>));
  expect(host.querySelector('[data-navigation="shown"]')).not.toBeNull();
  await act(async () => root.unmount()); host.remove(); localStorage.clear();
});

it('places navigation in the document bar and publication after the document without remounting typed text', async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  localStorage.clear();
  const host = document.createElement('div'); document.body.append(host); const root = createRoot(host);
  await act(async () => root.render(<EditorWorkspace inlineControls navigation={<nav>Article 1</nav>} session={<aside>Publication controls</aside>}><div data-mode-bar><EditorNavigationToggle /></div><input aria-label="Draft" defaultValue="Original" /></EditorWorkspace>));
  const field = host.querySelector('input')!; field.value = 'Unsaved text';
  expect(host.querySelectorAll('button')).toHaveLength(1);
  expect(host.querySelector('[data-mode-bar] button')).not.toBeNull();
  expect(host.querySelector('details')?.previousElementSibling?.contains(field)).toBe(true);
  expect(host.querySelectorAll('aside')).toHaveLength(1);
  await act(async () => fireEvent.click(getByRole(host, 'button', { name: 'Show article navigation' })));
  expect(host.querySelector('[data-navigation="shown"]')).not.toBeNull();
  expect(host.querySelector('input')).toBe(field);
  expect(field.value).toBe('Unsaved text');
  await act(async () => root.unmount()); host.remove(); localStorage.clear();
});
