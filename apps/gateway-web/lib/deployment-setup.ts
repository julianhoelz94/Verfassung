import { identityBaseUrl } from './identity-client';

export type SetupStatus = { completed: boolean; tlsMode: string; publicUrl: string };
export type LanguagePolicy = { supported: string[]; enabled: string[]; defaultLanguage: string; managed: boolean };
export type SetupDetails = {
  status: SetupStatus;
  preferences: { mailDeferred: boolean; accessReviewed: boolean; enabledLanguages: string[]; defaultLanguage: string };
  languages: LanguagePolicy;
  settings: { key: string; group: string; source: string; optional: boolean; configured: boolean; editable: boolean }[];
  required: string[]; completedAt: string | null; legacyInstallation: boolean;
};

export async function setupRequest<T>(path: string, bearer?: string, method = 'GET', body?: unknown): Promise<T> {
  const response = await fetch(`${identityBaseUrl()}${path}`, {
    method, cache: 'no-store', signal: AbortSignal.timeout(5000),
    headers: { ...(bearer ? { Authorization: bearer } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (!response.ok) {
    if (response.status === 403) throw new Error('step-up-or-permission');
    throw new Error('setup-request-failed');
  }
  return response.json() as Promise<T>;
}

export const setupStatus = () => setupRequest<SetupStatus>('/setup/status');
export const siteLanguages = () => setupRequest<LanguagePolicy>('/site/languages');

const publicPaths = new Set(['/login', '/login/mfa', '/logout', '/impressum', '/datenschutz', '/api/setup-gate', '/api/identity/login', '/api/identity/login/mfa', '/api/identity/mfa/enroll/start', '/api/identity/mfa/enroll/confirm', '/api/identity/setup/status', '/api/identity/site/languages', '/api/identity/registration/status', '/setup/transport/status']);
const administratorPaths = new Set(['/setup', '/admin/settings', '/admin/anonymous-browsing', '/account/step-up', '/api/identity/setup', '/api/identity/setup/complete', '/api/identity/me', '/api/identity/logout', '/api/identity/mfa/step-up', '/api/identity/admin/settings', '/api/identity/admin/settings/test-mail', '/api/identity/admin/anonymous-browsing']);

export function setupPathAllowed(uri: string, administrator: boolean): boolean {
  let path: string;
  try { path = decodeURIComponent(uri.split('?')[0]); } catch { return false; }
  if (path.includes('\\') || path.includes('..') || path.includes('//')) return false;
  if (path.startsWith('/_next/static/') || path === '/favicon.ico') return true;
  if (publicPaths.has(path)) return true;
  if (/^\/api\/document\/legal-pages\/(imprint-details|impressum|datenschutz|impressum_en|datenschutz_en)$/.test(path)) return true;
  return administrator && (administratorPaths.has(path) || /^\/admin\/legal\/(impressum|datenschutz|impressum_en|datenschutz_en)$/.test(path) || /^\/api\/document\/legal-pages\/(imprint-details|impressum|datenschutz|impressum_en|datenschutz_en)\/(editor(\/revisions)?|draft|publish)$/.test(path));
}
