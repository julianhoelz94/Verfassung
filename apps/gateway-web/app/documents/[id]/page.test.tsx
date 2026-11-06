import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import PublicDocumentPage from './page';
import { getDocument } from '../../../lib/document-api';
import { currentUser, requireSessionBearer } from '../../../lib/session';

vi.mock('../../../lib/document-api', () => ({ getDocument: vi.fn() }));
vi.mock('../../../lib/session', () => ({ currentUser: vi.fn(), requireSessionBearer: vi.fn(async () => 'Bearer editorial') }));
vi.mock('next/navigation', () => ({ notFound: () => { throw new Error('not-found'); } }));
const documentRecord = {
  id: 'law', citationKey: 'PrivateNewKey', currentRevision: 2, status: 'active', createdAt: '2020-01-01',
  revision: {
    id: 'pinned-revision', documentId: 'law', revision: 1, title: 'Historical source', citationKey: 'HistoricalKey',
    fileName: 'law.pdf', contentType: 'application/pdf', description: null, sourceUrl: null, createdAt: '2020-01-01', createdBy: 'editor',
    bibliography: { type: 'report', authors: [{ literal: 'Federal Council' }], editors: [], issued: '1949', extra: {} },
    attachments: [
      { id: 'primary', fileName: 'law.pdf', contentType: 'application/pdf', size: 100, sha256: 'one', primary: true },
      { id: 'supplement', fileName: 'annex.txt', contentType: 'text/plain', size: 20, sha256: 'two', primary: false },
    ],
  },
};
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(currentUser).mockResolvedValue(null);
  vi.mocked(getDocument).mockResolvedValue(documentRecord);
});
const page = (revision = '1') => PublicDocumentPage({ params: Promise.resolve({ id: 'law' }), searchParams: Promise.resolve({ revision }) });

describe('document citation reading', () => {
  it('renders the exact authorized snapshot bibliography and manifest for public readers', async () => {
    const html = renderToStaticMarkup(await page());
    expect(getDocument).toHaveBeenCalledWith('law', 1, undefined);
    expect(requireSessionBearer).not.toHaveBeenCalled();
    expect(html).toContain('HistoricalKey'); expect(html).not.toContain('PrivateNewKey');
    expect(html).toContain('Federal Council');
    expect(html).toContain('/revisions/1/attachments/supplement/file');
    expect(html).not.toContain('/revisions/2/');
  });

  it('allows editorial staff to inspect private historical evidence using their own authorization', async () => {
    vi.mocked(currentUser).mockResolvedValue({ id: 'reviewer', email: 'reviewer@example.test', roles: ['reviewer'] });
    const html = renderToStaticMarkup(await page());
    expect(getDocument).toHaveBeenCalledWith('law', 1, 'Bearer editorial');
    expect(html).toContain('/documents/command?action=file&amp;documentId=law&amp;revision=1&amp;attachmentId=supplement');
  });

  it('keeps viewers on the same public revision authorization path as anonymous readers', async () => {
    vi.mocked(currentUser).mockResolvedValue({ id: 'viewer', email: 'viewer@example.test', roles: ['viewer'] });
    await page();
    expect(getDocument).toHaveBeenCalledWith('law', 1, undefined);
    expect(requireSessionBearer).not.toHaveBeenCalled();
  });

  it('rejects invalid revisions before resolving a document', async () => {
    await expect(page('0')).rejects.toThrow('not-found');
    expect(getDocument).not.toHaveBeenCalled();
  });
});
