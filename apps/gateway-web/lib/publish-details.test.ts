import { describe, expect, it, vi } from 'vitest';

vi.mock('next/headers', () => ({ cookies: vi.fn() }));

import { EditorApiError } from './editor-api';
import { readPublishChanges } from './publish-details';

const added = { articleId: 'article', articleNumber: '1', changeType: 'added', pendingAfterLogicalId: 'draft-unit' };

describe('legal change record inputs', () => {
  it('keeps a saved added row whose target is still pending publication', () => {
    expect(readPublishChanges(JSON.stringify([added]))).toEqual([{ ...added, afterRef: null }]);
  });

  it('uses the same target normalization before save and publication', () => {
    const changed = { ...added, changeType: 'changed', beforeRef: { logicalId: 'old-unit', versionId: 'source' }, afterRef: { logicalId: 'new-unit' } };
    expect(readPublishChanges(JSON.stringify([changed]))[0]).toMatchObject({ afterRef: null, pendingAfterLogicalId: 'new-unit' });
    const published = { ...changed, afterRef: { logicalId: 'new-unit', versionId: 'target' } };
    expect(readPublishChanges(JSON.stringify([published]))[0]).toMatchObject({ afterRef: published.afterRef, pendingAfterLogicalId: null });
  });

  it.each(['{', '{}', 'null', '[null]', JSON.stringify([added, { ...added, changeType: 'removed' }])])(
    'rejects an invalid payload entirely instead of silently dropping rows: %s',
    (raw) => expect(() => readPublishChanges(raw)).toThrow(EditorApiError),
  );

  it('preserves deliberate empty legacy change records', () => {
    expect(readPublishChanges('[]')).toEqual([]);
  });
});
