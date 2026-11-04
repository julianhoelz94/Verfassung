import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, expect, it, vi } from 'vitest';
import { requireAdminPage } from '../../../../lib/admin';
import { adminImprintDetails, adminLegalPage, adminLegalPageRevisions } from '../../../../lib/legal-pages';
import LegalPage from './page';

const calls = vi.hoisted(() => [] as string[]);
vi.mock('../../../../lib/admin', () => ({ requireAdminPage: vi.fn() }));
vi.mock('../../../../lib/session', () => ({ requireSessionBearer: async () => { calls.push('bearer'); return 'Bearer editor'; } }));
vi.mock('../../../../lib/server-locale', () => ({ currentLocale: async () => { calls.push('locale'); return 'en'; } }));
vi.mock('../../../../lib/legal-pages', () => ({ adminImprintDetails: vi.fn(), adminLegalPage: vi.fn(), adminLegalPageRevisions: vi.fn() }));
vi.mock('./actions', () => ({ saveLegalDraftAction: async () => '', publishLegalPageAction: async () => '' }));
vi.mock('next/navigation', () => ({ notFound: () => { throw new Error('not-found'); }, useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));

const revision = { revision: 4, content: 'Exact legal draft.\nSecond line.', createdAt: '2026-01-01T12:00:00Z', createdBy: 'owner' };
const contact = { revision: 7, name: 'Named owner', streetAddress: 'Main road 1', postalCode: '12345', city: 'Town', country: 'Country', email: 'owner@example.test' };

beforeEach(() => {
  vi.clearAllMocks(); calls.length = 0;
  vi.mocked(requireAdminPage).mockImplementation(async () => { calls.push('admin'); return { id: 'admin', email: 'admin@example.test', roles: ['admin'] }; });
  vi.mocked(adminLegalPage).mockImplementation(async key => { calls.push('page'); return { key, draft: revision, published: { ...revision, revision: 3 } }; });
  vi.mocked(adminLegalPageRevisions).mockImplementation(async () => { calls.push('history'); return [revision]; });
  vi.mocked(adminImprintDetails).mockImplementation(async () => { calls.push('contact'); return { draft: contact, published: contact, managedFields: ['name'] }; });
});

async function render(key: string, search: Record<string, string> = {}) {
  return renderToStaticMarkup(await LegalPage({ params: Promise.resolve({ key }), searchParams: Promise.resolve(search) }));
}

it('rejects an unknown legal key before authorization or downstream reads', async () => {
  await expect(render('unknown')).rejects.toThrow('not-found');
  expect(calls).toEqual([]);
});

it('requires the administrator before loading legal text or credentials', async () => {
  vi.mocked(requireAdminPage).mockResolvedValue(null);
  expect(await render('impressum')).toContain('Administrator role required.');
  expect(calls).toEqual([]);
});

it('reads authorization, text, history and shared contact in that order', async () => {
  const html = await render('impressum_en', { saved: '1', published: '1' });
  expect(calls).toEqual(['admin', 'bearer', 'page', 'history', 'contact', 'locale']);
  expect(adminLegalPage).toHaveBeenCalledWith('impressum_en', 'Bearer editor');
  expect(html).toContain('name="expectedContactRevision" value="7"');
  expect(html).toContain('readOnly=""');
  expect(html).toContain('Exact legal draft.\nSecond line.');
});

it('does not request imprint data for the privacy page', async () => {
  const html = await render('datenschutz');
  expect(calls).toEqual(['admin', 'bearer', 'page', 'history', 'locale']);
  expect(html).not.toContain('name="expectedContactRevision"');
  expect(html).not.toContain('name="email"');
});

it('requires a saved shared contact before imprint publication', async () => {
  vi.mocked(adminImprintDetails).mockResolvedValue({ draft: null, published: contact });
  const document = new DOMParser().parseFromString(await render('impressum'), 'text/html');
  const publish = [...document.querySelectorAll('form')].find(form => form.querySelector('details[open]'))!;
  expect(publish.querySelector('button')?.disabled).toBe(true);
  expect(publish.querySelector('input[name=expectedContactRevision]')?.getAttribute('value')).toBe('0');
});

it('renders no publication form without a draft and keeps revision restore pins', async () => {
  vi.mocked(adminLegalPage).mockResolvedValue({ key: 'datenschutz', draft: null, published: revision });
  const html = await render('datenschutz', { error: 'unknown-code' });
  expect(html).not.toContain('<details open=""');
  expect(html).toContain('name="expectedRevision" value="0"');
  expect(html).toContain('name="content" value="Exact legal draft.\nSecond line."');
});
