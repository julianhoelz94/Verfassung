import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { StructuredPreview } from '../../lib/structured-editor';
import { PublishForm } from './PublishForm';

const structuredDraft: StructuredPreview = {
  sessionId: 'session', sourceVersionId: 'source', sourceGeneration: 1,
  settingsRevisionId: 'settings', generation: 1, sourceRoots: [], roots: [], operations: [],
};

describe('structured legal publish readiness', () => {
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
