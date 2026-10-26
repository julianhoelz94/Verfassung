function decode(value: string): ArrayBuffer {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, '='));
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return bytes.buffer;
}

function encode(value: ArrayBuffer): string {
  const bytes = new Uint8Array(value);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

type JsonRecord = Record<string, unknown>;

function publicKey(options: JsonRecord): JsonRecord {
  return (options.publicKey && typeof options.publicKey === 'object' ? options.publicKey : options) as JsonRecord;
}

export async function createPasskey(options: JsonRecord): Promise<JsonRecord> {
  if (!window.isSecureContext || !navigator.credentials?.create) throw new Error('Passkeys require a secure browser context.');
  const source = publicKey(options);
  const user = source.user as JsonRecord;
  const excludeCredentials = (source.excludeCredentials as JsonRecord[] | undefined)?.map((item) => ({
    ...item, id: decode(item.id as string),
  }));
  const credential = await navigator.credentials.create({
    publicKey: {
      ...source,
      challenge: decode(source.challenge as string),
      user: { ...user, id: decode(user.id as string) },
      excludeCredentials,
    } as PublicKeyCredentialCreationOptions,
  }) as PublicKeyCredential | null;
  if (!credential) throw new Error('Passkey setup was cancelled.');
  const response = credential.response as AuthenticatorAttestationResponse;
  return {
    id: credential.id,
    rawId: encode(credential.rawId),
    type: credential.type,
    response: {
      attestationObject: encode(response.attestationObject),
      clientDataJSON: encode(response.clientDataJSON),
      transports: response.getTransports?.() ?? [],
    },
    clientExtensionResults: credential.getClientExtensionResults(),
  };
}

export async function getPasskey(options: JsonRecord): Promise<JsonRecord> {
  if (!window.isSecureContext || !navigator.credentials?.get) throw new Error('Passkeys require a secure browser context.');
  const source = publicKey(options);
  const allowCredentials = (source.allowCredentials as JsonRecord[] | undefined)?.map((item) => ({
    ...item, id: decode(item.id as string),
  }));
  const credential = await navigator.credentials.get({
    publicKey: { ...source, challenge: decode(source.challenge as string), allowCredentials } as PublicKeyCredentialRequestOptions,
  }) as PublicKeyCredential | null;
  if (!credential) throw new Error('Passkey sign-in was cancelled.');
  const response = credential.response as AuthenticatorAssertionResponse;
  return {
    id: credential.id,
    rawId: encode(credential.rawId),
    type: credential.type,
    response: {
      authenticatorData: encode(response.authenticatorData),
      clientDataJSON: encode(response.clientDataJSON),
      signature: encode(response.signature),
      userHandle: response.userHandle ? encode(response.userHandle) : null,
    },
    clientExtensionResults: credential.getClientExtensionResults(),
  };
}
