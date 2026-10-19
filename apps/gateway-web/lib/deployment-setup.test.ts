import { describe, it, expect } from 'vitest';
import { setupPathAllowed } from './deployment-setup';

describe('setup access policy', () => {
  it('permits bootstrap login and published legal pages', () => {
    for (const path of ['/login', '/login/mfa', '/api/identity/mfa/enroll/confirm', '/impressum', '/api/document/legal-pages/datenschutz']) expect(setupPathAllowed(path, false)).toBe(true);
  });
  it('permits only setup operations even for an administrator', () => {
    for (const path of ['/setup', '/admin/settings', '/api/identity/setup/complete', '/admin/legal/impressum', '/api/document/legal-pages/impressum/draft']) expect(setupPathAllowed(path, true)).toBe(true);
    for (const path of ['/countries/DE', '/mcp', '/oauth/token', '/api/docs/content', '/api/identity/users', '/api/identity/passkeys/login/start', '/api/content/versions/example']) expect(setupPathAllowed(path, true)).toBe(false);
  });
  it('rejects traversal, malformed escapes, prefix collisions and anonymous setup operations', () => {
    for (const path of ['/setup', '/api/identity/setup/complete', '/login-extra', '/login%2f..%2fapi/content', '/%ZZ', '//login', '/admin/legal/impressum/history', '/api/identity/registration']) expect(setupPathAllowed(path, false)).toBe(false);
  });
});
