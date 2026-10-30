// READ-2: Account Guide: explicit consent, authored text exclusions and restoring original.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mount, click, button } from '../../test/dom';
import { translateContentAction } from '../content-translation/actions';
import { ContentTranslation } from './ContentTranslation';
import { WikiPanel } from './WikiPanel';
import { getByRole } from '@testing-library/dom';
vi.mock('next/navigation', () => ({ usePathname: () => '/countries/XA' }));
vi.mock('../content-translation/actions', () => ({ translateContentAction: vi.fn() }));
let view: Awaited<ReturnType<typeof mount>>;
afterEach(async () => { if (view) await view.close(); vi.clearAllMocks(); });
const content = <article lang="de"><p data-translate-content> Original wording </p><p>Interface text</p><code data-translate-content>literal-code</code><p data-translate-content data-no-translate>Excluded quote</p></article>;
async function show(options: { authenticated?: boolean; enabled?: boolean; alwaysTranslate?: boolean; sourceLanguage?: string } = {}, children = content) {
  view = await mount(<ContentTranslation sourceLanguage={options.sourceLanguage ?? 'de'} authenticated={options.authenticated ?? true} enabled={options.enabled ?? true} alwaysTranslate={options.alwaysTranslate ?? false}>{children}</ContentTranslation>);
}

describe('content translation preserves consent and the source', () => {
  it.each([{ authenticated: false }, { enabled: false }])('does not send content without sign-in and provider enablement: %j', async options => {
    await show(options); expect(button(view.host, 'Translate this content').disabled).toBe(true); expect(translateContentAction).not.toHaveBeenCalled();
  });
  it('sends only opted-in authored text and restores its exact whitespace and language', async () => {
    vi.mocked(translateContentAction).mockResolvedValue(['Translated wording']); await show(); await click(button(view.host, 'Translate this content'));
    expect(translateContentAction).toHaveBeenCalledWith(['Original wording'], 'de', 'en');
    expect(view.host.querySelector('article')?.getAttribute('lang')).toBe('en'); expect(view.host.querySelector('[data-translate-content]')?.textContent).toBe(' Translated wording ');
    expect(view.host.textContent).toContain('Interface text'); expect(view.host.textContent).toContain('Excluded quote'); expect(view.host.textContent).toContain('literal-code');
    await click(button(view.host, 'Show original')); expect(view.host.querySelector('[data-translate-content]')?.textContent).toBe(' Original wording '); expect(view.host.querySelector('article')?.getAttribute('lang')).toBe('de');
  });
  it('keeps a nested Wiki language scope separate from the constitution source', async () => {
    vi.mocked(translateContentAction).mockResolvedValue(['Translated law']);
    await show({}, <><p data-translate-content>Legal wording</p><div data-content-translation><p data-translate-content>Wiki introduction</p></div></>);
    await click(button(view.host, 'Translate this content'));
    expect(translateContentAction).toHaveBeenCalledWith(['Legal wording'], 'de', 'en');
    expect(view.host.textContent).toContain('Wiki introduction');
  });
  it('deduplicates repeated source passages while updating each occurrence', async () => {
    vi.mocked(translateContentAction).mockResolvedValue(['Translated']); await show({}, <div><p data-translate-content>Same source</p><p data-translate-content>Same source</p></div>); await click(button(view.host, 'Translate this content'));
    expect(translateContentAction).toHaveBeenCalledWith(['Same source'], 'de', 'en'); expect([...view.host.querySelectorAll('p')].map(p => p.textContent)).toEqual(['Translated', 'Translated']);
  });
  it('retains the source and exposes an error when the provider fails', async () => {
    vi.mocked(translateContentAction).mockRejectedValue(new Error('quota exceeded')); await show(); await click(button(view.host, 'Translate this content'));
    expect(view.host.querySelector('[role="alert"]')).not.toBeNull(); expect(view.host.textContent).toContain('Original wording'); expect(button(view.host, 'Translate this content').disabled).toBe(false);
  });
  it('automatically translates only when the saved preference permits it and respects Show original', async () => {
    vi.mocked(translateContentAction).mockResolvedValue(['Translated wording']); await show({ alwaysTranslate: true });
    expect(translateContentAction).toHaveBeenCalledTimes(1); await click(button(view.host, 'Show original')); expect(translateContentAction).toHaveBeenCalledTimes(1); expect(view.host.textContent).toContain('Original wording');
  });
  it('does not send content already authored in the selected language', async () => {
    await show({ alwaysTranslate: true, sourceLanguage: 'en-GB' }); expect(translateContentAction).not.toHaveBeenCalled(); expect(view.host.querySelector('button')).toBeNull();
  });
  it('places the compact Wiki control in its header and restores the exact source', async () => {
    vi.mocked(translateContentAction).mockResolvedValue(['Translated wording']);
    view = await mount(<WikiPanel id="wiki" title="About this place" onClose={vi.fn()}><ContentTranslation compact sourceLanguage="de" authenticated enabled alwaysTranslate={false}>{content}</ContentTranslation></WikiPanel>);
    const control = getByRole(view.host, 'button', { name: 'Translate this content', exact: true });
    expect(control.textContent).toBe('');
    expect(control.parentElement?.querySelector('[role=tooltip]')?.textContent).toBe('Translate this content');
    expect(control.compareDocumentPosition(view.host.querySelector('h2')!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    await click(control);
    expect(view.host.querySelector('[data-translate-content]')?.textContent).toBe(' Translated wording ');
    await click(getByRole(view.host, 'button', { name: 'Show original', exact: true }));
    expect(view.host.querySelector('[data-translate-content]')?.textContent).toBe(' Original wording ');
    expect(translateContentAction).toHaveBeenCalledTimes(1);
  });
  it('offers an accessible compact sign-in link without sending anonymous Wiki text', async () => {
    view = await mount(<ContentTranslation compact sourceLanguage="auto" authenticated={false} enabled alwaysTranslate={false}>{content}</ContentTranslation>);
    const link = view.host.querySelector('a');
    expect(link?.getAttribute('aria-label')).toBe('Log in to translate this content.');
    expect(link?.getAttribute('href')).toBe('/login');
    expect(link?.textContent).toBe('');
    expect(translateContentAction).not.toHaveBeenCalled();
  });
  it('splits more than 128 distinct passages into bounded batches without losing their order', async () => {
    vi.mocked(translateContentAction).mockImplementation(async texts => texts.map(text => `translated ${text}`));
    await show({}, <article>{Array.from({ length: 129 }, (_, index) => <p key={index} data-translate-content>{`Source ${index}`}</p>)}</article>);
    await click(button(view.host, 'Translate this content'));
    expect(vi.mocked(translateContentAction).mock.calls.map(([texts]) => texts.length)).toEqual([128, 1]);
    expect([...view.host.querySelectorAll('p')].map(node => node.textContent)).toEqual(Array.from({ length: 129 }, (_, index) => `translated Source ${index}`));
  });
  it('bounds batch sizes for long authored passages and reconstructs the translated text', async () => {
    vi.mocked(translateContentAction).mockImplementation(async texts => texts.map(text => `translated(${text.length})`));
    await show({}, <p data-translate-content>{'a'.repeat(10000) + 'b'.repeat(10000) + 'c'.repeat(3000)}</p>); await click(button(view.host, 'Translate this content'));
    expect(translateContentAction).toHaveBeenCalledTimes(2);
    for (const [texts] of vi.mocked(translateContentAction).mock.calls) { expect(texts.length).toBeLessThanOrEqual(128); expect(texts.reduce((sum, text) => sum + text.length, 0)).toBeLessThanOrEqual(20000); expect(texts.every(text => text.length <= 10000)).toBe(true); }
    expect(view.host.textContent).toContain('translated(10000)translated(10000)translated(3000)');
  });
});
