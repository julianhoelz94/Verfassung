import { renderToStaticMarkup } from 'react-dom/server';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { Simulate } from 'react-dom/test-utils';
import { describe, expect, it } from 'vitest';
import type { StructuredPreview } from '../../lib/structured-editor';
import { PublishForm } from './PublishForm';

const structuredDraft: StructuredPreview = {
  sessionId: 'session', sourceVersionId: 'source', sourceGeneration: 1,
  settingsRevisionId: 'settings', generation: 1, sourceRoots: [], roots: [], operations: [],
};

describe('structured legal publish readiness', () => {
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
