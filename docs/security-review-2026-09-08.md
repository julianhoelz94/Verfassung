# Security review (2026-09-08)

Read-only scans of `apps/gateway-web`, `infra/`, and all eight Kotlin services, plus targeted small fixes in this change.

Open work is ticketed as **SEC-1–SEC-11** in [`backlog.md`](../backlog.md#security-review-2026-09-08).

## Fixed in this change

| ID | What changed |
| --- | --- |
| S-F-2, S-F-3 | MFA recovery codes and enrollment challenge tokens no longer travel in the URL. Recovery uses form state (`MfaForms.tsx`); the account enroll challenge uses the `ca_mfa_challenge` httpOnly cookie. |
| S-F-4 | Compose runs gateway with `NODE_ENV=production`; `SESSION_COOKIE_SECURE` defaults to `true` (local-stack still sets `false`). |
| S-F-5 | Caddy sets `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`. CSP is **SEC-2**. |
| S-F-6 | `gateway-web` publishes `127.0.0.1:3000` only. |
| S-F-7 | Gateway image: `npm ci`, multi-stage, `USER node`. |
| S-F-8 | CI workflow `permissions: contents: read`. Action SHA pins are **SEC-10**. |
| S-F-9 | Login TOTP seed hint is gated on `IDENTITY_SEED_MODE`. |
| S-F-10 | Editor errors redirect with a key; the page maps keys to fixed copy. |
| S-F-11 | One `safeReturnTo` in `lib/return-to.ts` (backslash + host check). |
| S-F-12 | Postgres password is `${POSTGRES_PASSWORD:-postgres}`. |
| S-F-13 | `backup.sh`: `umask 077` and retention prune. |
| S-F-14 | Kotlin images run as `USER 65532`. Dependabot now lists every service `Dockerfile`. |
| S-F-1 (interim) | Caddy pins `Host` to `gateway-web:3000` on the UI reverse_proxy. Full Next.js upgrade is **SEC-1**. |
| S-B-2 | TOTP/recovery attempts share the login throttle (`mfa:<userId>` / `mfa-ip:<ip>`); locked MFA login deletes the challenge. |
| S-B-4 | Invite, disable, enable, admin-issued reset, and service-token create/revoke require fresh MFA step-up. |
| S-B-5 | User sessions cannot spoof `actorId`/`actorEmail` on audit append; only `audit:append` service tokens may set actor fields. |
| S-B-6 | `/me`, admin checks, and password change go through idle-timeout `requireActiveSession` (idle sessions are not revived). |
| S-B-9, S-B-10 | Default MFA key removed from `application.yml` (profile overlays keep the local default). Production requires 32-byte base64 and rejects `log-reset-token`. |
| S-B-11 | `step_up_at` is set only when MFA was verified on that session. |
| S-B-12 | Unauthenticated password-reset requests are throttled by email and IP. |
| S-B-13 | `GET /import-jobs/{id}` requires importer auth; gateway forwards the session Bearer. |
| S-B-14 (limit) | Article list defaults `limit` to 200 (clients that omit `limit` or pass `>200` still get at most 200; `X-Total-Count` is the full size). Gateway `listAllArticles` pages; `/editor` uses that so large versions are not truncated. Body-size caps are **SEC-11**. |
| S-B-17 | Non-admin owners cannot approve their own draft. |

## Remaining (ticketed)

### High

- **S-F-1 / SEC-1** — Next.js **14.2.5** is EOL. Known issues include Server Actions SSRF (GHSA-89xv-2m56-2m9x) if Host is client-controlled. Host is now pinned at Caddy; still upgrade to a supported 15.5.x line.
- **S-B-1 / SEC-4** — `GET /events` on audit-service is unauthenticated and returns login IPs, user agents, emails, and draft bodies.

### Medium

- **S-B-3 / SEC-5** — `POST /versions/{id}/publish` on catalog allows any `editor` or `catalog:write` token; bypasses publisher role and MFA step-up.
- **S-B-7 / SEC-6** — No connect/read timeouts on inter-service `RestClient`s.
- **S-F-15 / SEC-3** — Swagger UI / OpenAPI JSON is public at `/api/docs/*`.

### Low / Info (ticketed or deferred)

- **S-F-16** — gzip on authenticated HTML (BREACH once TLS terminates at Caddy). Defer until TLS; recovery-code URLs are already gone.
- **S-F-17** — Unencoded path segments in some hrefs (broken links, not XSS).
- **S-B-8** — `X-Forwarded-For` first hop for throttle keys; mitigated by Caddy in Compose.
- **S-B-15 / SEC-9** — `X-Correlation-Id` echoed without length/charset allow-list (eight copies; fold into PLAT-5).
- **S-B-16 / SEC-7** — Service tokens never expire.
- **S-B-18 / SEC-8** — Audit append-only rules do not cover `TRUNCATE` / owner `DROP RULE`.
- **S-B-19** — springdoc 2.6.0 vs Boot 3.5; logstash-logback-encoder 7.4. Hygiene, no confirmed CVE in used paths.
- **S-F-8 remainder / SEC-10** — GitHub Actions pinned by mutable tag, not SHA.
- **S-B-14 remainder / SEC-11** — No JSON body size / nesting cap on import, article replace, or editor save.
- **S-F-5 remainder / SEC-2** — Content-Security-Policy with nonces for Next.js.

## Verified OK (not issues)

- No committed `.env` secrets; only `env/*.env.example`.
- Session cookies: `httpOnly`, `SameSite=lax`, bounded `maxAge`; token not in client JS.
- Passwords: BCrypt; dummy hash on unknown email; login throttle on `/login`.
- Tokens: 32-byte `SecureRandom`, SHA-256 at rest, single-use invite/reset.
- MFA crypto: AES-GCM, random 12-byte IV.
- SQL in all eight repos is parameterized; search uses `plainto_tsquery` with a bound parameter.
- Write endpoints (except the catalog-publish gap) authenticate via identity `/me`.
- No `dangerouslySetInnerHTML` in app code; `sourceUrl` is protocol-allow-listed.
- Actuator: `health,info` only. No `pull_request_target` in CI.
