// OUTLINE-1: settings/editing contracts and automatic sentence configuration.
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { fireEvent, getByLabelText, getByRole, getByText, queryByLabelText } from '@testing-library/dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { OutlineKindWrite, SettingsImpact } from '../../../lib/api';
import { DEFAULT_NEW_OUTLINE } from '../../../lib/outline';
import { mount as mountView, click, button, change } from '../../../test/dom';
import { previewOutlineImpactAction } from './actions';
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


describe('outline settings behavioral contracts', () => {
let view: Awaited<ReturnType<typeof mountView>>;
afterEach(async () => { if (view) await view.close(); vi.restoreAllMocks(); vi.clearAllMocks(); });
const settings = () => JSON.parse((view.host.querySelector('[name="outline"]') as HTMLInputElement).value) as OutlineKindWrite[];
const impact = (classification = 'reversible', revision = 'settings-r2'): SettingsImpact => ({ classification, currentRevisionId: revision, affectedVersionIds: ['published'], affectedDraftSessionIds: [], reasons: ['Published settings remain pinned.'], violations: [] });
async function existing() { view = await mountView(<OutlineEditor constitutionId="charter" settingsRevisionId="settings-r2" initial={DEFAULT_NEW_OUTLINE} />); }

describe('structure editing preserves stable identities', () => {
  it('changes a configured visible label without changing an existing technical kind identity', async () => {
    await existing(); await change(view.host.querySelector('[name="label-0"]')!, 'ARTICLE');
    expect(settings()[0]).toMatchObject({ kindCode: 'article', displayLabel: 'ARTICLE', allowedChildKinds: ['paragraph'] });
    expect((view.host.querySelector('[name="code-0"]') as HTMLInputElement).disabled).toBe(true);
  });
  it('renames a new kind and its parent relationship together', async () => {
    view = await mountView(<OutlineEditor initial={DEFAULT_NEW_OUTLINE} />);
    await change(view.host.querySelector('[name="label-1"]')!, 'Sub Section');
    expect(settings()[1].kindCode).toBe('sub-section'); expect(settings()[0].allowedChildKinds).toEqual(['sub-section']);
  });
  it('inserts a deeper structural level before the terminal sentence kind', async () => {
    await existing(); await click(button(view.host, 'Add deeper layer'));
    const current = settings(); expect(current.map(item => item.kindCode)).toEqual(['article', 'paragraph', 'layer-4', 'sentence']);
    expect(current[1].allowedChildKinds).toEqual(['layer-4']); expect(current[2].allowedChildKinds).toEqual(['sentence']);
  });
  it('removes references to a deleted kind and retains the first root', async () => {
    await existing(); await click(button(view.host, 'Remove level'));
    const current = settings(); expect(current.map(item => item.kindCode)).toEqual(['article', 'sentence']); expect(current[0].root).toBe(true); expect(current[0].allowedChildKinds).toEqual([]);
  });
  it('adds a separate top-level kind without making it a child of the last leaf', async () => {
    await existing(); await click(button(view.host, 'Add top-level kind'));
    const current = settings(); expect(current.at(-1)).toMatchObject({ root: true, allowedChildKinds: [] }); expect(current.at(-2)?.allowedChildKinds).toEqual([]);
  });
  it('disables title display when titles are not permitted', async () => {
    await existing(); await change(view.host.querySelector('[name="title-policy-0"]')!, 'none');
    expect(settings()[0]).toMatchObject({ titlePolicy: 'none', showTitle: false });
  });
  it('disables kind/title display for running text and offers inline labels', async () => {
    await existing(); await change(view.host.querySelector('[name="presentation-2"]')!, 'concatenated');
    const kind = view.host.querySelectorAll('li.card')[2];
    expect([...kind.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')].filter(input => input.disabled).length).toBeGreaterThanOrEqual(2);
    await change(view.host.querySelector('[name="label-placement-2"]')!, 'superscript'); expect(settings()[2].labelPlacement).toBe('superscript');
  });
});

describe('impact checks gate settings writes', () => {
  it('requires a successful impact check and invalidates it after editing', async () => {
    await existing(); expect(button(view.host, 'Save outline').disabled).toBe(true);
    vi.mocked(previewOutlineImpactAction).mockResolvedValue(impact()); await click(button(view.host, 'Preview change impact'));
    expect(button(view.host, 'Save outline').disabled).toBe(false); expect(view.host.textContent).toContain('Published settings remain pinned.');
    const submitted = vi.mocked(previewOutlineImpactAction).mock.calls[0][0]; expect(submitted.get('constitutionId')).toBe('charter'); expect(JSON.parse(String(submitted.get('outline')))[0].displayLabel).toBe('Article');
    await change(view.host.querySelector('[name="label-0"]')!, 'New label'); expect(button(view.host, 'Save outline').disabled).toBe(true);
  });
  it.each([['migration_required', 'settings-r2'], ['reversible', 'stale-r1']])('does not enable saving after %s / %s impact', async (classification, revision) => {
    await existing(); vi.mocked(previewOutlineImpactAction).mockResolvedValue(impact(classification, revision)); await click(button(view.host, 'Preview change impact')); expect(button(view.host, 'Save outline').disabled).toBe(true);
  });
  it('exposes an impact failure and permits a new check', async () => {
    await existing(); vi.mocked(previewOutlineImpactAction).mockRejectedValue(new Error('offline')); await click(button(view.host, 'Preview change impact'));
    expect(view.host.querySelector('[role="alert"]')).not.toBeNull(); expect(button(view.host, 'Save outline').disabled).toBe(true); expect(button(view.host, 'Preview change impact').disabled).toBe(false);
  });
});

describe('guided creation requires explicit review and creation', () => {
  it('collects basics, chooses a template and reviews before creating', async () => {
    const action = vi.fn().mockRejectedValue(new Error('save unavailable'));
    view = await mountView(<OutlineEditor initial={DEFAULT_NEW_OUTLINE} guidedCreation action={action}><input name="title" defaultValue="New Charter" required /><input name="isoCode" defaultValue="XA" /></OutlineEditor>);
    await click(button(view.host, 'Continue to structure')); expect(action).not.toHaveBeenCalled();
    await click([...view.host.querySelectorAll<HTMLButtonElement>('.creation-template')][0]);
    expect(settings().map(item => item.kindCode)).toEqual(['article']);
    await click(button(view.host, 'Continue to review')); expect(view.host.textContent).toContain('New Charter · XA'); expect(action).not.toHaveBeenCalled();
    const create = button(view.host, 'Create constitution');
    await click(create);
    expect(action).toHaveBeenCalledTimes(1); expect((action.mock.calls[0][0] as FormData).get('title')).toBe('New Charter'); expect(view.host.querySelector('[role="alert"]')).not.toBeNull(); expect(create.disabled).toBe(false);
  });
  it('does not advance a structure with duplicate kind codes to creation', async () => {
    view = await mountView(<OutlineEditor initial={DEFAULT_NEW_OUTLINE} guidedCreation><input name="title" defaultValue="Charter" /></OutlineEditor>);
    await click(button(view.host, 'Continue to structure')); await change(view.host.querySelector('[name="code-1"]')!, 'article');
    await click(button(view.host, 'Continue to review')); expect(view.host.querySelector('[role="alert"]')).not.toBeNull(); expect(view.host.querySelector('[data-create="true"]')).toBeNull();
  });
});

});
