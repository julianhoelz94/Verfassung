import { fetchWithTimeout } from './fetch-with-timeout';
import { IdentityApiError, identityBaseUrl } from './identity-client';

export type TranslationSiteSettings = {
  provider: 'off' | 'google' | 'deepl';
  sharedKeyConfigured: boolean;
  sharedGoogleCharactersUsed: number;
  sharedGoogleCharacterLimit: number;
};

export type TranslationUserSettings = {
  alwaysTranslate: boolean;
  personalGoogleKeyConfigured: boolean;
};

async function read<T>(path: string, token?: string): Promise<T> {
  const response = await fetchWithTimeout(`${identityBaseUrl()}/content-translation/${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    cache: 'no-store',
  });
  if (!response.ok) throw new Error(`Translation settings returned ${response.status}`);
  return response.json() as Promise<T>;
}

async function write<T>(path: string, method: 'PUT' | 'POST', body: object, token: string): Promise<T> {
  const response = await fetchWithTimeout(`${identityBaseUrl()}/content-translation/${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    cache: 'no-store',
  }, fetch, path === 'translate-batch' ? 30_000 : undefined);
  if (!response.ok) {
    const body = await response.json().catch(() => ({})) as { error?: string; code?: string };
    throw new IdentityApiError(body.error ?? 'Content translation failed', response.status, body.code);
  }
  return response.json() as Promise<T>;
}

export const translationAvailability = () => read<{ enabled: boolean }>('availability');
export const translationSiteSettings = (token: string) => read<TranslationSiteSettings>('admin', token);
export const translationUserSettings = (token: string) => read<TranslationUserSettings>('me', token);
export const updateTranslationSiteSettings = (token: string, body: object) => write<TranslationSiteSettings>('admin', 'PUT', body, token);
export const updateTranslationUserSettings = (token: string, body: object) => write<TranslationUserSettings>('me', 'PUT', body, token);
export const translateContentBatch = (token: string, texts: string[], sourceLanguage: string, targetLanguage: string) =>
  write<{ texts: string[]; provider: string }>('translate-batch', 'POST', { texts, sourceLanguage, targetLanguage }, token);
