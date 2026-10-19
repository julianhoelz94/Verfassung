# Sprint 60 Identity security review

The user requested a deeper Identity review after the repository-wide cleanup.
This extends Sprint 60; the earlier merged cleanup alone does not close it.
The audit follows password/session, account lifecycle, TOTP/recovery, passkey,
OAuth/personal-key, service-token, setup and public-proxy paths. Tests use isolated
PostgreSQL fixtures and fictional accounts. These findings establish code defects;
they do not establish whether any deployed installation was exploited.

## Confirmed findings and corrections

| Finding | Consequence | Correction / regression |
| --- | --- | --- |
| Password login considered only TOTP enrollment | A passkey-only viewer obtained a password-only session; an administrator/publisher could bootstrap a replacement factor using only the password | Check all stored factors, challenge existing factors, reject bootstrap once any factor exists; test viewer/admin passkey-only states and real browser passkey enrollment/login |
| Role changes preserved password-only sessions | A promoted account gained administrator reads/writes without satisfying mandatory MFA | Revoke personal credentials on role changes; required-role session validation checks stored MFA proof; test old session rejection after promotion |
| Optional-MFA roles were always reported as freshly verified | An editor without MFA, or with stale proof, could authorize OAuth import credentials | Derive freshness from stored proof for every role; OAuth and personal-key import authorization share the actual factor/freshness gate; test absent, fresh and expired proof |
| Invitations and reset links used separate read/mark operations | Concurrent requests could consume one link repeatedly and overwrite the resulting password | Conditional expiry-aware consumption and owner serialization; six-thread test requires exactly one winner for each link type |
| Disabling an invited account left its invitation active | Accepting the link re-enabled the account | Invalidate pending invitations, registration/reset links and authentication challenges on disable; test activation remains denied |
| Password reset retained pre-reset enrollment challenges | Someone who had already passed the old password could enroll a factor after reset | Revoke pending TOTP/passkey enrollment, browser sessions and personal credentials; test both enrollment APIs reject the old challenge |
| Key/token issuance did not serialize with revocation | An already-authenticated request could mint personal credentials after reset had returned | Lock the owner, recheck the session/code/credential, then issue within the transaction; PostgreSQL blocking-lock tests cover session-backed MCP creation and code-backed OAuth redemption |
| First TOTP enrollment trusted an ordinary session alone | A stolen session could establish a new factor without password reauthentication | Require current password when starting account enrollment; a password-backed enrollment challenge can be resumed without re-entering the password; test missing password rejection |
| Password reauthentication had no shared guessing budget | A stolen session could use sensitive endpoints to guess the password outside login limits | Owner-scoped budget shared by password change and factor management; rejected attempts persist; test alternating endpoints reach the same lockout |
| Throttle updates read and replaced a counter | Concurrent attempts lost failure increments | Atomic PostgreSQL increment with bounded escalating lockout; 60 concurrent increments retain the exact count |
| Login checked limits before waiting on an owner lock | Queued attempts continued checking passwords after an earlier attempt locked the account | Recheck email/IP limits after acquiring the lock; six queued requests permit only five password failures |
| Public Identity OAuth alias forwarded an untrusted peer header | Changing `X-Atlas-Client-IP` bypassed the registration quota | Both public routes replace that header; real isolated Caddy tests reproduce the old bypass and reject forged/duplicate headers; all transport modes enforce the adapted-route invariant |
| Gateway authentication calls dropped the original client IP | Passkey/MFA failures shared the gateway's IP bucket and could lock out other visitors | Pass Caddy's trusted peer and browser agent through server-side Identity requests; regression keeps distinct visitor identities separate while preserving credentials and cancellation |
| Raw forwarded IP chains were trusted behind an external proxy | Forging the leftmost entry could evade IP limits or target another visitor's budget | Pin Caddy's computed peer on gateway and Identity routes; server actions and Identity APIs use only the pinned header, with real external-proxy regression |
| Recovery codes contained only about 50 bits of randomness | A leaked hash database made offline recovery-code guessing cheaper than necessary | New codes contain about 100 random bits in four readable groups; existing stored codes still verify, and regeneration replaces them; API tests enforce the stronger minimum and one-use behavior |
| Passkey-only users had no UI route to refresh expired proof | Corrected freshness checks stranded them on a TOTP-only confirmation page | Account-bound WebAuthn step-up refreshes the current session; reject cross-account/public-login reuse of its challenges; preserve safe return/OAuth destinations |

The earlier repository-wide review also made recovery-code consumption atomic;
its eight-thread PostgreSQL test permits exactly one successful consumer.

## Security invariants

- Passwords are BCrypt hashes; enrollment/reset validates its 72-byte UTF-8 limit.
  Opaque credentials use secure randomness and SHA-256 hashes in storage. TOTP and
  configured secret values use authenticated encryption with a production key guard.
- `UserDto.mfaEnabled` describes authenticator-app enrollment. Authentication checks
  passkeys separately; this presentation field must not decide whether bootstrap is safe.
- MFA freshness always needs a recent stored session proof. Roles decide which
  operations require it, rather than manufacturing a positive proof.
- Credential issuance, password/factor changes, role changes and revocation share
  an owner row lock. Recheck after waiting; a stale session/code must fail after a
  reset or role change wins that lock. Login/logout and service-token issuance use
  the same ordering. Already-issued automation service tokens keep their explicit
  lifecycle and are not personal credentials tied to their creator's enabled flag.
- Caddy is the sole public entry point. It replaces the peer header on public
  routes; Identity and the gateway trust that pinned value, never raw client
  forwarding chains. Internal service ports must remain private.
- Failed password/MFA verification commits its throttling updates despite returning
  an authentication error. Successful credential changes remain transactional.
- Password change keeps the current authenticated session and revokes other
  sessions, pending enrollment/reset links and personal MCP/OAuth material. Reset,
  disablement and role changes revoke all personal sessions/challenges/credentials.
  Enrolled TOTP/passkeys remain available to their owner after a password reset;
  reset cannot replace those factors. Re-enabling does not resurrect revoked tokens.
- WebAuthn verifies origin, relying-party ID, user verification and credential
  ownership. Step-up challenges bind to the signed-in account and cannot be used
  as anonymous login challenges. Required-MFA accounts retain a final factor.
- OAuth retains exact registered redirect/client/resource binding, S256 PKCE,
  constant-time verifier comparison, expiry and atomic one-use redemption. Scoped
  tokens cannot act as browser sessions or administer accounts. Live ownership,
  enablement and import-role checks remain in place.

## Verification and limits

Six initial API/concurrency regressions failed against `2e0dc04`, reproducing the
passkey, promotion, OAuth freshness, invite-disable, stale-enrollment and one-use
link defects. Their first correction pass succeeded. The full Identity check then
passed with the added PostgreSQL revocation-race, reauthentication and throttle
tests. Final queued-login and passkey-step-up coverage, independent correction
reviews, gateway/browser checks and required PR/main/Wiki CI complete close-out;
final results are recorded in the Sprint 60 Linear plan.

This is a source review with controlled exploit regressions, not a production
penetration test or incident investigation. Transport trust configuration,
production secrets, SMTP and external identity clients still depend on the actual
deployment. Existing TOTP accepts adjacent time steps for clock skew; challenges
and recovery codes are consumed once, and online attempts are throttled. The
review does not claim resistance to phishing or compromise of the user's device.
