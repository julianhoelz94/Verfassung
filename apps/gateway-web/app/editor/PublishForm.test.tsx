import { renderToStaticMarkup } from 'react-dom/server';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { Simulate } from 'react-dom/test-utils';
import { describe, expect, it } from 'vitest';
import type { DraftNode, StructuredPreview } from '../../lib/structured-editor';
import { PublishForm } from './PublishForm';

const structuredDraft: StructuredPreview = {
  sessionId: 'session', sourceVersionId: 'source', sourceGeneration: 1,
  settingsRevisionId: 'settings', generation: 1, sourceRoots: [], roots: [], operations: [],
};

describe('structured legal publish readiness', () => {
  const sourceRoot: DraftNode = {
    logicalId: 'article-logical', occurrenceId: 'article-occurrence', kind: 'article', label: '1', title: 'Rights',
    content: [{ type: 'child', node: {
      logicalId: 'paragraph-logical', occurrenceId: 'paragraph-occurrence', kind: 'paragraph', label: '2',
      content: [{ type: 'text', logicalId: 'text-logical', occurrenceId: 'text-occurrence', text: 'Everyone has equal rights.' }],
    } }],
  };

  it.each([
    { logicalId: 'paragraph-logical', occurrenceId: 'paragraph-occurrence', unitKind: 'node' as const, label: 'Article 1 Rights › Paragraph 2' },
    { logicalId: 'text-logical', occurrenceId: 'text-occurrence', unitKind: 'text_entry' as const, label: 'Everyone has equal rights.' },
  ])('opens the containing article and focuses the nested $unitKind source passage', ({ logicalId, occurrenceId, unitKind, label }) => {
    const markup = renderToStaticMarkup(<PublishForm
      sessionId="session" versionId="source" articleId="article-occurrence" hopKind="legal"
      status="reviewing" canEdit={false} canPublish={false}
      structuredDraft={{ ...structuredDraft, sourceRoots: [sourceRoot], roots: [sourceRoot] }}
      outline={{ kinds: [{ kindCode: 'article', displayLabel: 'Article' }, { kindCode: 'paragraph', displayLabel: 'Paragraph' }] }}
      record={{ title: 'Law', comment: 'Revised wording', documents: [], changes: [{
        articleId: 'article-occurrence', articleNumber: '1', changeType: 'changed',
        beforeRef: { versionId: 'historical-version', logicalId, occurrenceId, rootOccurrenceId: 'article-occurrence', unitKind },
        pendingAfterLogicalId: logicalId,
      }] }} />);
    const document = new DOMParser().parseFromString(markup, 'text/html');
    const source = document.querySelector<HTMLAnchorElement>('a[href^="/versions/"]')!;
    const destination = new URL(source.getAttribute('href')!, 'https://atlas.example');
    expect(destination.pathname).toBe('/versions/historical-version/units/article-occurrence');
    expect(destination.searchParams.get('occurrenceId')).toBe(occurrenceId);
    expect(source.textContent).toContain(label);
    const draft = document.querySelector<HTMLAnchorElement>('a[href^="/editor?"]')!;
    const draftDestination = new URL(draft.getAttribute('href')!, 'https://atlas.example');
    expect(draftDestination.searchParams.get('sessionId')).toBe('session');
    expect(draftDestination.searchParams.get('selectedNode')).toBe(logicalId);
  });

  it('recovers the root from loaded source content when an older saved reference omits it', () => {
    const markup = renderToStaticMarkup(<PublishForm
      sessionId="session" versionId="source" articleId="article-occurrence" hopKind="legal"
      status="reviewing" canEdit={false} canPublish={false}
      structuredDraft={{ ...structuredDraft, sourceRoots: [sourceRoot], roots: [sourceRoot] }}
      record={{ title: 'Law', comment: 'Removed paragraph', documents: [], changes: [{
        articleId: 'article-occurrence', articleNumber: '1', changeType: 'removed',
        beforeRef: { versionId: 'source', logicalId: 'paragraph-logical', occurrenceId: 'paragraph-occurrence' },
      }] }} />);
    const document = new DOMParser().parseFromString(markup, 'text/html');
    expect(document.querySelector('a')?.getAttribute('href')).toBe('/versions/source/units/article-occurrence?occurrenceId=paragraph-occurrence');
  });

  it('leaves an unresolved nested source reference as readable text instead of a broken root link', () => {
    const markup = renderToStaticMarkup(<PublishForm
      sessionId="session" versionId="source" articleId="article-occurrence" hopKind="legal"
      status="reviewing" canEdit={false} canPublish={false}
      record={{ title: 'Law', comment: 'Removed paragraph', documents: [], changes: [{
        articleId: 'article-occurrence', articleNumber: '1', changeType: 'removed',
        beforeRef: { versionId: 'source', logicalId: 'paragraph-logical', occurrenceId: 'paragraph-occurrence' },
      }] }} />);
    const document = new DOMParser().parseFromString(markup, 'text/html');
    expect(document.querySelector('a[href^="/versions/"]')).toBeNull();
    expect(document.body.textContent).toContain('1');
    expect(document.body.textContent).not.toContain('paragraph-logical');
  });

  it('shows readable passage labels rather than internal identities during review', () => {
    const root = { logicalId: 'internal-unit-id', kind: 'article', label: '1', title: 'Human dignity', content: [] };
    const markup = renderToStaticMarkup(<PublishForm sessionId="session" versionId="source" articleId="article" hopKind="legal"
      status="reviewing" canEdit={false} canPublish={false}
      structuredDraft={{ ...structuredDraft, sourceRoots: [root], roots: [root] }}
      outline={{ kinds: [{ kindCode: 'article', displayLabel: 'Article' }] }}
      record={{ title: 'Law', comment: 'Revised wording', documents: [], changes: [{ articleId: 'article', articleNumber: '1', changeType: 'changed', beforeRef: { logicalId: root.logicalId }, pendingAfterLogicalId: root.logicalId }] }} />);
    expect(markup).toContain('Article 1 Human dignity');
    expect(markup).not.toContain('>internal-unit-id');
    expect(markup).toContain('selectedNode=internal-unit-id');
  });
  it('retains a saved pending draft target outside the first 100 picker options', () => {
    const markup = renderToStaticMarkup(<PublishForm
      sessionId="session" versionId="source" articleId="article" hopKind="legal"
      status="open" canEdit canPublish={false}
      structuredDraft={{ ...structuredDraft, roots: Array.from({ length: 101 }, (_, index) => ({ logicalId: `unit-${index}`, kind: 'article', label: String(index), content: [] })) }}
      record={{ title: 'Law', comment: 'Added unit', documents: [], changes: [{
        articleId: 'article', articleNumber: '100', changeType: 'added', pendingAfterLogicalId: 'unit-100',
      }] }}
    />);
    expect(markup).toContain('<option value="unit-100" selected="">');
  });

  it('clears the pending draft target when changing a row to removed', async () => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    const host = document.createElement('div');
    const root = createRoot(host);
    try {
      await act(async () => root.render(<PublishForm
        sessionId="session" versionId="source" articleId="article" hopKind="legal"
        status="open" canEdit canPublish={false} structuredDraft={structuredDraft}
        record={{ title: 'Law', comment: 'Change', documents: [], changes: [{
          articleId: 'article', articleNumber: '1', changeType: 'changed',
          beforeRef: { logicalId: 'source-unit', versionId: 'source' }, pendingAfterLogicalId: 'draft-unit',
        }] }}
      />));
      const select = host.querySelector<HTMLSelectElement>('#publish-0-type')!;
      await act(async () => { select.value = 'removed'; Simulate.change(select); });
      const changes = JSON.parse(host.querySelector<HTMLInputElement>('[name="changesJson"]')!.value);
      expect(changes[0]).toMatchObject({ changeType: 'removed', afterRef: null, pendingAfterLogicalId: null, beforeRef: { logicalId: 'source-unit' } });
    } finally {
      await act(async () => root.unmount());
    }
  });

  it('accepts a saved draft after selection when the target ref is still pending publication', () => {
    const markup = renderToStaticMarkup(<PublishForm
      sessionId="session" versionId="source" articleId="article" hopKind="legal"
      status="approved" canEdit={false} canPublish={true} structuredDraft={structuredDraft}
      record={{ title: 'Law', comment: 'Changed sentence', documents: [], changes: [{
        articleId: 'article', articleNumber: '1', changeType: 'changed',
        beforeRef: { logicalId: 'source-unit', versionId: 'source' },
        pendingAfterLogicalId: 'draft-unit',
      }] }}
    />);
    expect(markup).toContain('Publish new legal version</button>');
    expect(markup).not.toContain('disabled=""');
  });
});
