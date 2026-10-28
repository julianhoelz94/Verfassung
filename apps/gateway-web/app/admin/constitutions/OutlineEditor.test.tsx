import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { fireEvent, getByLabelText, getByRole, getByText, queryByLabelText } from '@testing-library/dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { OutlineKindWrite } from '../../../lib/api';
import { OutlineEditor } from './OutlineEditor';
import { TranslationProvider } from '../../components/TranslationProvider';

vi.mock('./actions', () => ({ saveOutlineAction: vi.fn(), previewOutlineImpactAction: vi.fn() }));
vi.mock('./OutlineReaderPreview', () => ({ OutlineReaderPreview: () => null }));

const leaf: OutlineKindWrite = { kindCode: 'clause', displayLabel: 'Clause', presentation: 'concatenated', showLabel: false, showTitle: false, showKind: false, root: true, allowedChildKinds: [], segmentation: 'sentence' };

describe('automatic sentence settings', () => {
  let host: HTMLElement;
  let root: Root;
  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    host = document.createElement('main'); document.body.append(host); root = createRoot(host);
  });
  afterEach(async () => { await act(async () => root.unmount()); host.remove(); });
  async function mount(initial = [leaf]) { await act(async () => root.render(<OutlineEditor initial={initial} />)); }
  function payload(): OutlineKindWrite[] { return JSON.parse(host.querySelector<HTMLInputElement>('input[name="outline"]')!.value); }

  it('preserves custom delimiter sequences and the spaces needed to type another one', async () => {
    await mount();
    const input = getByLabelText(host, 'Sentence delimiters') as HTMLInputElement;
    expect(input.value).toBe('. ! ?');
    await act(async () => fireEvent.change(input, { target: { value: '; 。 ' } }));
    expect(input.value).toBe('; 。 ');
    await act(async () => fireEvent.change(input, { target: { value: '; 。 ?!' } }));
    expect(payload()[0]?.sentenceDelimiters).toEqual([';', '。', '?!']);
    expect(payload()[0]).not.toHaveProperty('delimiterInput');
  });

  it('hides delimiter controls when automatic creation is disabled without losing the choices', async () => {
    await mount([{ ...leaf, sentenceDelimiters: [';', '。'] }]);
    const automatic = getByLabelText(host, 'Automatically create sentence nodes');
    await act(async () => fireEvent.click(automatic));
    expect(queryByLabelText(host, 'Sentence delimiters')).toBeNull();
    expect(payload()[0]).toMatchObject({ segmentation: 'plain', sentenceDelimiters: [';', '。'] });
    await act(async () => fireEvent.click(automatic));
    expect((getByLabelText(host, 'Sentence delimiters') as HTMLInputElement).value).toBe('; 。');
  });

  it('turns off automatic creation when a leaf gains a child level', async () => {
    await mount();
    await act(async () => fireEvent.click(getByText(host, 'Add deeper layer', { selector: 'button' })));
    expect(payload()[0]).toMatchObject({ kindCode: 'clause', segmentation: 'plain', allowedChildKinds: ['layer-2'] });
    expect(host.querySelectorAll('input[name^="segmentation-"]')).toHaveLength(1);
    expect(host.textContent).toContain('Automatic sentence creation is available only on a level without child units.');
  });

  it('blocks an invalid punctuation configuration before the save action', async () => {
    const save = vi.fn();
    await act(async () => root.render(<OutlineEditor initial={[leaf]} action={save} />));
    await act(async () => fireEvent.change(getByLabelText(host, 'Sentence delimiters'), { target: { value: 'word' } }));
    await act(async () => fireEvent.submit(host.querySelector('form')!));
    expect(save).not.toHaveBeenCalled();
    expect(getByRole(host, 'alert').textContent).toContain('distinct punctuation sequences');
  });

  it('localizes automatic creation and delimiter controls', async () => {
    await act(async () => root.render(<TranslationProvider locale="de"><OutlineEditor initial={[leaf]} /></TranslationProvider>));
    expect(getByLabelText(host, 'Satzknoten automatisch anlegen')).not.toBeNull();
    expect(getByLabelText(host, 'Satztrennzeichen')).not.toBeNull();
  });
  it('turns off automatic creation when an authored label becomes required and explains why', async () => {
    await mount();
    const policy = host.querySelector<HTMLSelectElement>('select[name="label-policy-0"]')!;
    await act(async () => fireEvent.change(policy, { target: { value: 'required' } }));
    expect(payload()[0]).toMatchObject({ labelPolicy: 'required', segmentation: 'plain' });
    expect((getByLabelText(host, 'Automatically create sentence nodes') as HTMLInputElement).disabled).toBe(true);
    expect(host.textContent).toContain('Enter these units explicitly');
  });
});
