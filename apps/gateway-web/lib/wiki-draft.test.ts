import { expect, it } from 'vitest';
import { hasWikiPinConflict, wikiChanges, wikiCommandData, wikiDraft, wikiDraftIssue } from './wiki-draft';
import { legacyWikiDocument } from './wiki-document';
const documentId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const bodyDocument = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'citation', attrs: { reference: { id: documentId, documentId, revision: 2, locator: '' } } }] }] };
const draft = { ...wikiDraft(null), summary: 'Context' };
it('identifies the relevant save issue while leaving the working draft available for correction', () => {
  expect(wikiDraftIssue(draft)).toBeNull();
  expect(wikiDraftIssue({ ...draft, summary: '' })).toBe('summary');
  expect(wikiDraftIssue({ ...draft, body: 'a'.repeat(20001) })).toBe('text');
  expect(wikiDraftIssue({ ...draft, bodyDocument: { type: 'script' } })).toBe('text');
  expect(wikiDraftIssue({ ...draft, images: [{ documentId, revision: 1, alt: '' }] })).toBe('images');
  expect(wikiDraftIssue({ ...draft, bodyDocument, citations: [{ documentId, revision: 3, title: 'Conflicting' }] })).toBe('pins');
  expect(wikiDraftIssue({ ...draft, bodyDocument, images: [{ documentId, revision: 3, alt: 'Map' }] })).toBe('pins');
  expect(wikiDraftIssue({ ...draft, sourceUrls: 'javascript:alert(1)' })).toBe('sources');
  expect(wikiDraftIssue({ ...draft, sourceUrls: Array(21).fill('https://example.org').join('\n') })).toBe('sources');
  expect(wikiDraftIssue({ ...draft, sourceUrls: 'https://example.org\nhttp://example.org' })).toBeNull();
});
it('allows the current pin and a single edited occurrence but rejects other conflicting occurrences or images', () => {
  expect(hasWikiPinConflict({ ...draft, bodyDocument }, documentId, 3)).toBe(true);
  expect(hasWikiPinConflict({ ...draft, bodyDocument }, documentId, 3, documentId)).toBe(false);
  expect(hasWikiPinConflict({ ...draft, bodyDocument }, documentId, 2)).toBe(false);
  expect(hasWikiPinConflict({ ...draft, images: [{ documentId, revision: 2, alt: 'Map' }] }, documentId, 3)).toBe(true);
});
it('reviews formatting separately and serializes owner identity with the last saved revision', () => {
  const working = { ...draft, body: 'Text', bodyDocument: legacyWikiDocument('Text'), citations: [{ documentId, revision: 2, title: 'Canonical', citationNote: 'Note' }] };
  expect(wikiChanges(working, null)).toEqual(['summary', 'body', 'bodyDocument', 'citations']);
  const form = document.createElement('form');
  const data = wikiCommandData(form, { targetType: 'jurisdiction', targetId: documentId, jurisdictionId: documentId }, null, working, '/editor?sessionId=one');
  expect(data.get('targetType')).toBe('jurisdiction'); expect(data.get('expectedRevisionId')).toBe('');
  expect(JSON.parse(String(data.get('citations')))).toEqual([{ documentId, revision: 2, citationNote: 'Note' }]);
  expect(data.get('returnTo')).toContain('sessionId=one'); expect(JSON.parse(String(data.get('bodyDocument'))).type).toBe('doc');
});
