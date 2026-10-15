# Registration and account mail

Identity owns the registration switch, SMTP settings, confirmation tokens, TOTP secrets, and passkeys in its Postgres database. New installations start with self-registration and outgoing mail disabled. Incremental deployments preserve the settings because Flyway adds tables without replacing existing rows. A database reset removes the settings.

1. Sign in as an administrator and open **Admin → Account settings**.
2. Enter a sender address, public HTTPS site URL, SMTP host, port, credentials, and the appropriate TLS mode. Save with a fresh administrator authenticator step-up. SMTP credentials are encrypted with `IDENTITY_MFA_ENCRYPTION_KEY` and are never returned by the API. Preserve this key across deployments and restore it with the database.
3. Send a test email to any recipient address you specify. The page reports delivery failure.
4. Enable self-registration and save. The public Register link appears on the login page. The Identity API enforces the switch independently of the UI.

Registration sends a one-use confirmation link valid for 24 hours. The account is disabled until the link is used to set a password. Its sole initial role is `viewer`. Existing accounts receive the same generic response to a registration request and are not changed. An administrator can grant other roles later.

Authenticator setup happens after email confirmation and sign-in. The setup page provides a QR code and manual key; the confirmation email carries the one-use link but does not include the TOTP secret. Users should save the one-time recovery codes. Passkeys can be enrolled from Account after the current password is entered; administrator and publisher accounts also need a fresh step-up. A privileged account with no TOTP can choose a passkey at the password-login enrollment prompt. Passkey verification uses WebAuthn user verification, a one-use five-minute challenge, and the exact origin and RP ID from `PUBLIC_BASE_URL`. Keep that URL stable for enrolled passkeys and use HTTPS outside localhost. An enrolled passkey can sign in without a password, and users may keep TOTP alongside it.

If outgoing mail is not configured, existing admin invite links can still be delivered out of band. Self-registration cannot be enabled without mail settings, and the registration API rejects requests while mail is unavailable.

The full-stack CI job starts a Mailpit SMTP sink from `docker-compose.e2e.yml` and captures confirmation mail through its local HTTP API. Only the `ci` profile permits SMTP without TLS for this isolated sink; other profiles require STARTTLS or implicit TLS.
