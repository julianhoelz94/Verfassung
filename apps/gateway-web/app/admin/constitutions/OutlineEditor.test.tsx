// OUTLINE-1: settings/editing contract; each test asserts submitted settings or a user decision.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mount, click, button, change } from '../../../test/dom';
import { DEFAULT_NEW_OUTLINE } from '../../../lib/outline';
import type { OutlineKindWrite, SettingsImpact } from '../../../lib/api';
import { previewOutlineImpactAction } from './actions';
import { OutlineEditor } from './OutlineEditor';
vi.mock('./actions', () => ({ previewOutlineImpactAction: vi.fn(), saveOutlineAction: vi.fn() }));
let view: Awaited<ReturnType<typeof mount>>;
afterEach(async () => { if (view) await view.close(); vi.restoreAllMocks(); vi.clearAllMocks(); });
const settings = () => JSON.parse((view.host.querySelector('[name="outline"]') as HTMLInputElement).value) as OutlineKindWrite[];
const impact = (classification = 'reversible', revision = 'settings-r2'): SettingsImpact => ({ classification, currentRevisionId: revision, affectedVersionIds: ['published'], affectedDraftSessionIds: [], reasons: ['Published settings remain pinned.'], violations: [] });
async function existing() { view = await mount(<OutlineEditor constitutionId="charter" settingsRevisionId="settings-r2" initial={DEFAULT_NEW_OUTLINE} />); }

describe('structure editing preserves stable identities', () => {
  it('changes a configured visible label without changing an existing technical kind identity', async () => {
    await existing(); await change(view.host.querySelector('[name="label-0"]')!, 'ARTICLE');
    expect(settings()[0]).toMatchObject({ kindCode: 'article', displayLabel: 'ARTICLE', allowedChildKinds: ['paragraph'] });
    expect((view.host.querySelector('[name="code-0"]') as HTMLInputElement).disabled).toBe(true);
  });
  it('renames a new kind and its parent relationship together', async () => {
    view = await mount(<OutlineEditor initial={DEFAULT_NEW_OUTLINE} />);
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
    view = await mount(<OutlineEditor initial={DEFAULT_NEW_OUTLINE} guidedCreation action={action}><input name="title" defaultValue="New Charter" required /><input name="isoCode" defaultValue="XA" /></OutlineEditor>);
    await click(button(view.host, 'Continue to structure')); expect(action).not.toHaveBeenCalled();
    await click([...view.host.querySelectorAll<HTMLButtonElement>('.creation-template')][0]);
    expect(settings().map(item => item.kindCode)).toEqual(['article']);
    await click(button(view.host, 'Continue to review')); expect(view.host.textContent).toContain('New Charter · XA'); expect(action).not.toHaveBeenCalled();
    const create = button(view.host, 'Create constitution');
    await click(create);
    expect(action).toHaveBeenCalledTimes(1); expect((action.mock.calls[0][0] as FormData).get('title')).toBe('New Charter'); expect(view.host.querySelector('[role="alert"]')).not.toBeNull(); expect(create.disabled).toBe(false);
  });
  it('does not advance a structure with duplicate kind codes to creation', async () => {
    view = await mount(<OutlineEditor initial={DEFAULT_NEW_OUTLINE} guidedCreation><input name="title" defaultValue="Charter" /></OutlineEditor>);
    await click(button(view.host, 'Continue to structure')); await change(view.host.querySelector('[name="code-1"]')!, 'article');
    await click(button(view.host, 'Continue to review')); expect(view.host.querySelector('[role="alert"]')).not.toBeNull(); expect(view.host.querySelector('[data-create="true"]')).toBeNull();
  });
});
