# Operations and verification reference

Start with [[Development and operations|Technical-Development]] for everyday commands. Production deployment remains [[pending|Deployment-Information]].

## Data and recovery


Each service's Postgres database must be backed up with its migration history. The local [backup and restore scripts](https://github.com/julianhoelz94/Verfassung/tree/main/infra/backup) support development drills; restoring replaces data and is not a production runbook. Search and Audit are derived or secondary records; do not treat either as the canonical source for published constitutional text. Reindex Search after changes that affect published text or metadata using the supported application flow.

Identity also stores the registration switch, mail configuration, email confirmation tokens, TOTP secrets, and passkey credentials. Preserve `IDENTITY_MFA_ENCRYPTION_KEY` with its database backup; it encrypts SMTP credentials. Configure a stable HTTPS `PUBLIC_BASE_URL` before enrolling passkeys because WebAuthn validates its origin and relying party ID. New installations leave outgoing mail and self-registration disabled. The [account registration runbook](https://github.com/julianhoelz94/Verfassung/blob/main/docs/operations/account-registration.md) describes setup, the test email, and confirmation behavior. The CI full-stack profile uses Mailpit to exercise confirmation mail.


## UI verification coverage


The maintained [Sprint 59 audit](https://github.com/julianhoelz94/Verfassung/blob/main/docs/design/sprint-59-ui-review.md) records every page entry point and its disposition. `e2e/ui-review.spec.ts` checks the route inventory against source, then renders each page in English and German at 390, 820 and 1440px, checking headings, overflow and accessibility. Newer task screens have Linux screenshot baselines alongside the original visual suite; CI runs both suites. `e2e/mfa-review.spec.ts` covers selected-method MFA and secondary correction history. The real-stack account journeys decode the rendered QR pixels, confirm enrollment and verify single-use recovery codes. Real-stack authenticator journeys disable retained traces; mock diagnostics use synthetic secrets.

From `apps/gateway-web`, run `npm run test:e2e` for the mock journeys, and `npm run test:e2e:full` against a fixture-populated stack. Generate or verify screenshot baselines only in the prescribed Linux Playwright image. Inspect changed images before committing them; a baseline update alone is not proof of a usable layout.



## Local setup and HTTPS


A fresh local database uses the same setup restriction and completion rules as production. The local profile explicitly defaults to `TLS_MODE=local-http`, `PUBLIC_BASE_URL=http://localhost`, `SESSION_COOKIE_SECURE=false`, and loopback-bound published ports. No public certificate authority or host trust change is needed. Finish setup before loading content; the stack script then supports `--only-prepopulate` through the real APIs. CI may explicitly select `SETUP_FIXTURE_COMPLETE=true` for existing journeys; production rejects that fixture flag.

For optional local HTTPS, set `TLS_MODE=local-https`, use `PUBLIC_BASE_URL=https://localhost`, and enable secure cookies. Caddy stores its internal CA and certificates in the persistent `caddy-data` volume. Run `scripts/export-local-ca.sh` to export only the public root certificate, review it, then explicitly trust it in your host/browser if desired. The script never installs trust or exports the private key. The container-based fixture loader checks setup completion before authentication and exports only the public root to `.local-stack/local-root.crt` for its Node requests, without disabling certificate validation. Preserve Caddy volumes across rebuilds.

Transport checks include `python3 -m unittest discover -s infra/caddy -p 'test_*.py'`, generated-config validation in `scripts/check-transport-configs.py`, and actual local certificate issuance/trust/persistence in `scripts/test-local-https.py`. These use disposable containers/volumes. The isolated HTTP-01 test in `scripts/test-acme-http01.py` uses the official Pebble ACME server to verify real issuance and explicit challenge failure. `scripts/test-proxy-https.py` verifies proxy trust, scheme rejection and login gating until the public certificate verifies. These private tests do not verify a public Let's Encrypt challenge.

[[Development and operations|Technical-Development]]


## Controlled legacy archive aliases

Set `ATLAS_LEGACY_HOST` to a hostname controlled by the operator. Catalog's `ARCHIVE_LEGACY_HOSTS` comma-separated allowlist must include each accepted source hostname (default `www.verfassungen.de,verfassungen.de,legacy.localhost`). Mappings accept exact archive paths, query strings and fragments; they resolve only to validated local published snapshots or publicly linked pinned document revisions. External URLs are never redirect targets.

For managed HTTPS, point the alias at the same edge and make its HTTP-01 challenge reachable before enabling it. Caddy includes the explicit alias in certificate management and preserves path/query during HTTP→HTTPS redirection. The browser resolver carries fragments to Catalog because HTTP servers do not receive fragments. API/assets keep normal routing. An unset alias does not add a wildcard; local development uses `legacy.localhost`. Site deployment instructions remain pending.

Migration manifests and attempts are durable in the Ingestion database; temporary upload receipt expiry does not remove them. Back up captured Document files with their database revisions and manifests. Receipt, staging, preparation, review and publication are distinct states; verify complete prepared export, source inventory reasons and exact target pins before a pilot. See [[Legacy archive migration|Migration-Guide]].
