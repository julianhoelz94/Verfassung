import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { fireEvent } from '@testing-library/dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ContinuousCanvas, type CanvasController } from './ContinuousCanvas';
import type { CanvasBlock, CanvasUnit } from '../../lib/continuous-editor';

let host: HTMLElement, root: Root, controller: CanvasController;
let change: ReturnType<typeof vi.fn>;
const units: CanvasUnit[] = [{
  node: { logicalId: 'node', kind: 'sentence', content: [] },
  entry: { type: 'text', logicalId: 'text', text: 'Original' },
}];

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  Object.defineProperty(Range.prototype, 'getClientRects', { configurable: true, value: () => [] });
  Object.defineProperty(Range.prototype, 'getBoundingClientRect', { configurable: true, value: () => new DOMRect() });
  host = document.createElement('main');
  document.body.appendChild(host);
  root = createRoot(host);
  change = vi.fn();
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});

/** Reuses the same mounted editor when editability changes, matching role/readiness updates. */
async function mount(editable = true) {
  await act(async () => root.render(<ContinuousCanvas
    units={units} label="Constitution text" editable={editable} flowing boundaries={false}
    automatic={false} delimiters={['.']} notes={[]}
    onChange={change} onActivate={next => { controller = next; }}
    onUndo={() => undefined} onRedo={() => undefined}
  />));
  await act(async () => host.querySelector<HTMLElement>('[role=textbox]')!.focus());
}

/** Native paste is committed by the public editor surface rather than internal transaction helpers. */
async function paste(text: string) {
  await act(async () => fireEvent.paste(host.querySelector('[role=textbox]')!, {
    clipboardData: { getData: () => text },
  }));
}

it('restores rejected edits and allows the identical text to be submitted again', async () => {
  await mount();
  change.mockReturnValueOnce(false);
  await paste('New ');
  expect(host.querySelector('[data-unit=node]')!.textContent).toBe('Original');
  expect(controller.selection()).toEqual({ nodeId: 'node', textId: 'text', start: 0, end: 0 });
  await paste('New ');
  expect(change).toHaveBeenCalledTimes(2);
  const blocks = change.mock.calls[1][0] as CanvasBlock[];
  expect(blocks[0].text).toBe('New Original');
  expect(host.querySelector('[data-unit=node]')!.textContent).toBe('New Original');
});

it('ignores a document-changing controller command after editability is revoked', async () => {
  await mount();
  await mount(false);
  await act(async () => { controller.addReference({ type: 'footnote', footnoteId: 'note' }); });
  expect(change).not.toHaveBeenCalled();
  expect(host.querySelector('[data-unit=node]')!.textContent).toBe('Original');
  expect(host.querySelector('[data-footnote-marker]')).toBeNull();
});
