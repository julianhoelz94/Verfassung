// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/headers', () => ({ cookies: vi.fn() }));

import { AmendmentApiError } from './amendment-editor-api';
import { readRevisionBody, readWriteBody } from './amendment-form';

function form(): FormData {
  const data = new FormData();
  data.set('title', 'An amendment');
  data.set('changesJson', '[]');
  data.set('documentsJson', '[]');
  return data;
}

describe('amendment write inputs', () => {
  it.each(['{', 'null', '{}', '[null]', '[{"articleNumber":4,"changeType":"changed"}]'])(
    'rejects malformed changes instead of saving an empty replacement: %s',
    (raw) => {
      const data = form();
      data.set('changesJson', raw);
      expect(() => readWriteBody(data)).toThrow(AmendmentApiError);
    },
  );

  it.each(['{', 'null', '{}', '[null]', '[{"url":3}]'])(
    'rejects malformed documents instead of saving an empty replacement: %s',
    (raw) => {
      const data = form();
      data.set('documentsJson', raw);
      expect(() => readWriteBody(data)).toThrow(AmendmentApiError);
    },
  );

  it('accepts intentionally empty changes and documents', () => {
    expect(readWriteBody(form())).toMatchObject({ title: 'An amendment', changes: [], documents: [] });
  });

  it('preserves pending logical targets through both editing and restoration', () => {
    const change = {
      changeType: 'changed', articleNumber: ' 1 ', note: ' reason ',
      beforeRef: { versionId: 'source-version', logicalId: 'old-unit' },
      pendingAfterLogicalId: 'new-unit', linkReviewReason: 'checked',
    };
    const data = form();
    data.set('changesJson', JSON.stringify([change]));
    const restored = readRevisionBody(JSON.stringify({ title: 'An amendment', changes: [change] }));
    expect(restored.changes).toEqual(readWriteBody(data).changes);
    expect(restored.changes[0]).toMatchObject({ articleNumber: '1', note: 'reason', pendingAfterLogicalId: 'new-unit' });
  });

  it('keeps draft-target normalization and document references when restoring', () => {
    const restored = readRevisionBody(JSON.stringify({
      title: 'Old draft', changes: [{ changeType: 'added', afterRef: { logicalId: 'new-unit' } }],
      documents: [{ fileId: 'file-1', label: ' Gazette ' }],
    }));
    expect(restored.changes[0].pendingAfterLogicalId).toBe('new-unit');
    expect(restored.documents).toEqual([{ fileId: 'file-1', label: 'Gazette', url: null }]);
  });

  it.each(['null', '[]', '{"title":"Old draft","changes":null}'])(
    'rejects invalid restore payloads with a recoverable form error: %s',
    (raw) => expect(() => readRevisionBody(raw)).toThrow(AmendmentApiError),
  );
});
