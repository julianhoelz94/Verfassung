import { NextRequest } from 'next/server';
import { beforeEach, expect, it, vi } from 'vitest';
import { GET } from './route';
import { getReaderOutline, getUnit, getVersion, listAllUnits } from '../../../../lib/api';
import type { ArticleDetail, OrderedEntry, VersionDetail } from '../../../../lib/api';

vi.mock('../../../../lib/api', () => ({ getVersion: vi.fn(), getUnit: vi.fn(), getReaderOutline: vi.fn(), listAllUnits: vi.fn() }));
const version = { id: 'original', countryCode: 'XA', jurisdictionId: 'national', publicationStatus: 'published', versionLabel: 'Original', languageCode: 'de' } as VersionDetail;
const article: ArticleDetail = { id: 'article', versionId: 'original', articleNumber: '1', title: 'Rights', body: 'Exact authored text.', sortOrder: 0 };
const request = (query = 'versionId=original&articleId=article') => new NextRequest('http://localhost/api/reader/search-preview?' + query, { headers: { Authorization: 'Bearer staff-token' } });
beforeEach(() => {
  vi.resetAllMocks(); vi.mocked(getVersion).mockResolvedValue(version); vi.mocked(getUnit).mockResolvedValue(article);
  vi.mocked(getReaderOutline).mockResolvedValue(null); vi.mocked(listAllUnits).mockResolvedValue([]);
});
it('rejects path-like or missing ids before requesting any service', async () => {
  for (const query of ['', 'versionId=original', 'versionId=../draft&articleId=article', 'versionId=original&articleId=%2Fadmin', 'versionId=' + 'a'.repeat(129) + '&articleId=article']) expect((await GET(request(query))).status).toBe(400);
  expect(getVersion).not.toHaveBeenCalled(); expect(getUnit).not.toHaveBeenCalled();
});
it('requires the exact published snapshot and a resolvable public owner', async () => {
  for (const value of [null, { ...version, id: 'successor' }, { ...version, publicationStatus: 'draft' }, { ...version, countryCode: null, jurisdictionId: null }]) {
    vi.mocked(getVersion).mockResolvedValueOnce(value as VersionDetail | null);
    expect((await GET(request())).status).toBe(404);
  }
  expect(getUnit).not.toHaveBeenCalled();
});
it('returns the unmodified authored passage and a pinned reader link without forwarding staff credentials', async () => {
  const rich: ArticleDetail = { ...article, content: [{ type: 'text', logicalId: 'text', text: 'Original emphasis.', marks: [{ type: 'bold', start: 0, end: 8 }] }] };
  vi.mocked(getUnit).mockResolvedValueOnce(rich);
  const response = await GET(request()), body = await response.json();
  expect(response.headers.get('Cache-Control')).toBe('private, no-store');
  expect(body).toMatchObject({ article: rich, language: 'de', versionId: 'original', readerHref: '/countries/XA/versions/original#article' });
  expect(getVersion).toHaveBeenCalledExactlyOnceWith('original');
  expect(getUnit).toHaveBeenCalledExactlyOnceWith('original', 'article');
  expect(listAllUnits).not.toHaveBeenCalled();
});
it('rejects a unit missing from the pinned snapshot or returned for another occurrence/version', async () => {
  for (const value of [null, { ...article, versionId: 'successor' }, { ...article, id: 'other-article' }]) {
    vi.mocked(getUnit).mockResolvedValueOnce(value);
    expect((await GET(request())).status).toBe(404);
  }
});
it('loads cross-root endnotes once for the same snapshot and supports historical jurisdictions', async () => {
  const content: OrderedEntry[] = [{ type: 'text', text: 'Authored.', references: [{ logicalId: 'ref', start: 0, end: 8, target: { type: 'footnote', footnoteId: 'note' } }] }];
  vi.mocked(getVersion).mockResolvedValueOnce({ ...version, countryCode: null, jurisdictionId: 'historical' });
  vi.mocked(getUnit).mockResolvedValueOnce({ ...article, content });
  vi.mocked(listAllUnits).mockResolvedValueOnce([{ ...article, content: [{ type: 'text', logicalId: 'note', occurrenceId: 'note-occurrence', text: 'Exact source note.', format: 'footnote', footnoteLabel: 'a' }] }]);
  const body = await (await GET(request())).json();
  expect(body.notes).toMatchObject([{ logicalId: 'note', label: 'a', text: 'Exact source note.', href: '/jurisdictions/historical/versions/original#fn-note-occurrence' }]);
  expect(body.readerHref).toBe('/jurisdictions/historical/versions/original#article');
  expect(listAllUnits).toHaveBeenCalledExactlyOnceWith('original', true);
});
it('uses in-passage footnotes without fetching the full version and fails honestly on an unavailable service', async () => {
  vi.mocked(getUnit).mockResolvedValueOnce({ ...article, content: [{ type: 'text', format: 'footnote', logicalId: 'note', text: 'Source.' }] });
  expect((await (await GET(request())).json()).notes).toHaveLength(1); expect(listAllUnits).not.toHaveBeenCalled();
  vi.mocked(getVersion).mockRejectedValueOnce(new Error('offline'));
  expect((await GET(request())).status).toBe(503);
});
