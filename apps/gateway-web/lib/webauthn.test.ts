// AUTH-3: WebAuthn JSON/binary contract and browser cancellation; server validation stays in Identity.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPasskey, getPasskey } from './webauthn';
const bytes = (...values: number[]) => new Uint8Array(values).buffer;
const credential = { id: 'credential', type: 'public-key', rawId: bytes(251, 255), getClientExtensionResults: () => ({ credProps: { rk: true } }) };
let create: ReturnType<typeof vi.fn>;
let get: ReturnType<typeof vi.fn>;
beforeEach(() => {
  vi.stubGlobal('isSecureContext', true);
  create = vi.fn().mockResolvedValue({ ...credential, response: { attestationObject: bytes(1, 2), clientDataJSON: bytes(3, 4), getTransports: () => ['internal'] } });
  get = vi.fn().mockResolvedValue({ ...credential, response: { authenticatorData: bytes(1), clientDataJSON: bytes(2), signature: bytes(3), userHandle: bytes(4) } });
  vi.stubGlobal('navigator', { credentials: { create, get } });
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
describe('WebAuthn transport', () => {
  it('converts server base64url fields to binary and returns the exact attestation JSON', async () => {
    const result = await createPasskey({ publicKey: { challenge: 'AQI', user: { id: 'AwQ', name: 'owner' }, excludeCredentials: [{ type: 'public-key', id: '-_8' }] } });
    const publicKey = create.mock.calls[0][0].publicKey; expect(new Uint8Array(publicKey.challenge)).toEqual(new Uint8Array([1, 2])); expect(new Uint8Array(publicKey.user.id)).toEqual(new Uint8Array([3, 4])); expect(new Uint8Array(publicKey.excludeCredentials[0].id)).toEqual(new Uint8Array([251, 255]));
    expect(result).toEqual({ id: 'credential', rawId: '-_8', type: 'public-key', response: { attestationObject: 'AQI', clientDataJSON: 'AwQ', transports: ['internal'] }, clientExtensionResults: { credProps: { rk: true } } });
  });
  it('preserves challenge, allowed identity and all assertion bytes', async () => {
    const result = await getPasskey({ challenge: 'AQI', rpId: 'atlas.example', allowCredentials: [{ type: 'public-key', id: '-_8' }] });
    expect(get.mock.calls[0][0].publicKey.rpId).toBe('atlas.example'); expect(new Uint8Array(get.mock.calls[0][0].publicKey.challenge)).toEqual(new Uint8Array([1, 2]));
    expect(result).toMatchObject({ rawId: '-_8', response: { authenticatorData: 'AQ', clientDataJSON: 'Ag', signature: 'Aw', userHandle: 'BA' } });
  });
  it('keeps a missing user handle as null and missing transports as an empty list', async () => {
    get.mockResolvedValue({ ...credential, response: { authenticatorData: bytes(), clientDataJSON: bytes(), signature: bytes(), userHandle: null } }); expect((await getPasskey({ challenge: 'AQI' })).response).toMatchObject({ userHandle: null });
    create.mockResolvedValue({ ...credential, response: { attestationObject: bytes(), clientDataJSON: bytes() } }); expect((await createPasskey({ challenge: 'AQI', user: { id: 'AwQ' } })).response).toMatchObject({ transports: [] });
  });
  it.each(['create', 'get'])('reports browser cancellation for %s without inventing a credential', async operation => {
    create.mockResolvedValue(null); get.mockResolvedValue(null);
    await expect(operation === 'create' ? createPasskey({ challenge: 'AQI', user: { id: 'AwQ' } }) : getPasskey({ challenge: 'AQI' })).rejects.toThrow('cancelled');
  });
  it('requires a secure browser context before accessing a credential', async () => {
    vi.stubGlobal('isSecureContext', false);
    await expect(getPasskey({ challenge: 'AQI' })).rejects.toThrow('secure browser context'); expect(get).not.toHaveBeenCalled();
    await expect(createPasskey({ challenge: 'AQI' })).rejects.toThrow('secure browser context'); expect(create).not.toHaveBeenCalled();
  });
});
