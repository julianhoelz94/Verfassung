import { describe, expect, it, vi } from 'vitest';

vi.mock('next/headers', () => ({ cookies: vi.fn() }));

import { editorErrorMessage } from './editor-api';
import { amendmentErrorMessage } from './amendment-editor-api';

describe('URL error keys', () => {
  it.each(['constructor', '__proto__', 'toString', 'unknown'])('falls back for inherited or unknown key %s', (key) => {
    expect(editorErrorMessage(key)).toBe(editorErrorMessage('failed'));
    expect(amendmentErrorMessage(key, 'de')).toBe(amendmentErrorMessage('failed', 'de'));
  });

  it('keeps known localized errors and absent errors', () => {
    expect(editorErrorMessage('sign_in', 'de')).toBeTruthy();
    expect(amendmentErrorMessage('sign_in')).toBeTruthy();
    expect(editorErrorMessage(undefined)).toBeNull();
    expect(amendmentErrorMessage(undefined)).toBeNull();
  });
});
