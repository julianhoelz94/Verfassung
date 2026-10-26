import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getPasskey, createPasskey } from '../../lib/webauthn';
import { finishPasskeyLogin, finishPasskeyLoginEnrollment } from './actions';
import { PasskeyLogin } from './PasskeyLogin';
import { PasskeyLoginEnrollment } from './PasskeyLoginEnrollment';

vi.mock('../../lib/webauthn', () => ({ getPasskey: vi.fn(), createPasskey: vi.fn() }));
vi.mock('./actions', () => ({
  startPasskeyLogin: async () => ({ challengeId: 'challenge', options: {} }),
  startPasskeyLoginEnrollment: async () => ({ challengeId: 'enrollment', options: {} }),
  finishPasskeyLogin: vi.fn(), finishPasskeyLoginEnrollment: vi.fn(),
  startPasskeyStepUp: vi.fn(), finishPasskeyStepUp: vi.fn(),
}));

describe('passkey login return navigation', () => {
  let root: Root;
  let host: HTMLDivElement;
  const assign = vi.fn();
  beforeEach(() => {
    vi.clearAllMocks();
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host);
    vi.stubGlobal('window', new Proxy(window, {
      get(target, key, receiver) {
        return key === 'location' ? { assign } : Reflect.get(target, key, receiver);
      },
    }));
    vi.mocked(getPasskey).mockResolvedValue({ credential: 'passkey' });
    vi.mocked(createPasskey).mockResolvedValue({ credential: 'passkey' });
    vi.mocked(finishPasskeyLogin).mockResolvedValue({ roles: ['editor'] });
    vi.mocked(finishPasskeyLoginEnrollment).mockResolvedValue({ roles: ['editor'] });
  });
  afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals(); });

  for (const Component of [PasskeyLogin, PasskeyLoginEnrollment]) {
    it(`${Component.name} returns to the intended filtered view`, async () => {
      const next = '/editor?sessionId=session-1&versionId=version-1#draft';
      await act(async () => root.render(<Component next={next} />));
      await act(async () => host.querySelector('button')!.click());
      expect(assign).toHaveBeenCalledExactlyOnceWith(next);
      expect(host.querySelector('button')!.disabled).toBe(true);
    });

    it.each(['//evil.example', '/login', '/logout', '/parent/..//evil.example'])(`${Component.name} rejects an unsafe or looping destination: %j`, async (next) => {
      await act(async () => root.render(<Component next={next} />));
      await act(async () => host.querySelector('button')!.click());
      expect(assign).toHaveBeenCalledExactlyOnceWith('/editor');
    });
  }
});
