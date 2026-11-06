import { describe, expect, it } from 'vitest';
import { documentLibraryLocation } from './legacy-document-location';

describe('legacy document library destinations', () => {
  it('preserves folder/search context and selected documents', () => {
    expect(documentLibraryLocation({ q: 'Müller & law', folderId: 'project', offset: '30' }, { documentId: 'law' })).toBe('/documents?q=M%C3%BCller+%26+law&folderId=project&offset=30&documentId=law');
    expect(documentLibraryLocation({}, { new: '1' })).toBe('/documents?new=1');
  });

  it('retains only safe local return destinations', () => {
    expect(documentLibraryLocation({ returnTo: 'https://other.example' })).toBe('/documents?returnTo=%2Fdocuments');
    expect(documentLibraryLocation({ returnTo: '/editor?sessionId=draft' })).toBe('/documents?returnTo=%2Feditor%3FsessionId%3Ddraft');
  });
});
