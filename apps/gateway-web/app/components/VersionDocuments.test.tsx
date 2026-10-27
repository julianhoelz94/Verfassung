import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, expect, it, vi } from 'vitest';
vi.mock('../../lib/document-api', () => ({ listDocumentLinks: vi.fn() }));
import { listDocumentLinks, type DocumentLink } from '../../lib/document-api';
import { VersionDocuments } from './VersionDocuments';

afterEach(() => vi.resetAllMocks());
it('keeps legal source documents on a correction, pins revisions and removes duplicate links', async () => {
  const linked = { documentId: 'source', revisionId: 'revision', document: { revision: { id: 'revision', revision: 2, title: 'Original gazette' } } } as DocumentLink;
  vi.mocked(listDocumentLinks).mockImplementation(async (_type, id) => id === 'correction' ? [] : [linked]);
  const markup = renderToStaticMarkup(await VersionDocuments({ constitutionId: 'constitution', versionId: 'correction', legalVersionId: 'legal' }));
  expect(listDocumentLinks).toHaveBeenCalledWith('version', 'correction');
  expect(listDocumentLinks).toHaveBeenCalledWith('version', 'legal');
  expect(markup.match(/href="\/documents\/source\?revision=2"/g)).toHaveLength(1);
});
it('retains reading when the optional document service is unavailable', async () => {
  vi.mocked(listDocumentLinks).mockRejectedValue(new Error('unavailable'));
  expect(await VersionDocuments({ constitutionId: 'constitution', versionId: 'snapshot' })).toBeNull();
});
