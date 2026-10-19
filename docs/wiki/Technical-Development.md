# Development and operations

This page is for local development and verification. [[Deployment information|Deployment-Information]] remains pending until CD and a production runbook exist.

## Navigate the code

Start at [CODEMAPS/INDEX.md](https://github.com/julianhoelz94/Verfassung/blob/main/docs/CODEMAPS/INDEX.md), choose the relevant area map, and then verify it against the current code. `apps/gateway-web` contains the Next.js UI; `services/<name>` contains independent Spring Boot projects; `infra/caddy` routes public traffic. Flyway migrations live within the owning service and applied migrations must not be edited.

## Run the local stack

Install OrbStack (preferred) or another Docker-compatible engine with Compose; Bash and curl are also required. Java and Node on the host are optional for development checks. From the repository root:

```sh
cp env/local-stack.env.example env/local-stack.env  # once; keep real values out of git
./manageLocalStack.sh --start
./manageLocalStack.sh --status
./manageLocalStack.sh --stop                     # keeps database volumes
```

The local start flow compiles all services and builds images inside OrbStack or Docker, one image at a time with a single Gradle worker. It checks all nine service health endpoints, then uploads deterministic test fixtures with a Node tool container; backup jobs run only when explicitly requested.

`--start --no-build` reuses images; `--rebuild <service...>` applies source changes; `--only-prepopulate` runs the API-based fixture upload against an already running stack; add `--verify-only` to check saved fixtures without uploading.

A daemon-wide lock prevents overlapping local-stack builds. `docker buildx history ls` shows build records. In OrbStack, select the `build-monitor` container and open Logs to follow compilations; its completed logs remain available after it stops. OrbStack also shows runtime containers and images. `--reset` removes local database volumes and is destructive. See the [README](https://github.com/julianhoelz94/Verfassung/blob/main/README.md) and [stack script](https://github.com/julianhoelz94/Verfassung/blob/main/manageLocalStack.sh) for current flags and prerequisites.

## Verify changes

```sh
python3 scripts/test_local_stack.py     # orchestration and overlapping-build guards
cd services/<name> && ./gradlew test     # changed service
cd services/<name> && ./gradlew check    # includes formatting checks
cd apps/gateway-web && npm run lint && npm run build
```

CI also runs service checks, gateway tests and builds, image builds, publication checks, and browser journeys. Check the current [CI workflow](https://github.com/julianhoelz94/Verfassung/blob/main/.github/workflows/ci.yml) for required jobs. API docs are exposed by Caddy only when `CADDY_EXPOSE_API_DOCS=true` in the applicable local/CI profile, at `/api/docs/<service>/swagger-ui/index.html`.

## Data and recovery

Each service's Postgres database must be backed up with its migration history. The local [backup and restore scripts](https://github.com/julianhoelz94/Verfassung/tree/main/infra/backup) support development drills; restoring replaces data and is not a production runbook. Search and Audit are derived or secondary records; do not treat either as the canonical source for published constitutional text. Reindex Search after changes that affect published text or metadata using the supported application flow.

Identity also stores the registration switch, mail configuration, email confirmation tokens, TOTP secrets, and passkey credentials. Preserve `IDENTITY_MFA_ENCRYPTION_KEY` with its database backup; it encrypts SMTP credentials. Configure a stable HTTPS `PUBLIC_BASE_URL` before enrolling passkeys because WebAuthn validates its origin and relying party ID. New installations leave outgoing mail and self-registration disabled. The [account registration runbook](https://github.com/julianhoelz94/Verfassung/blob/main/docs/operations/account-registration.md) describes setup, the test email, and confirmation behavior. The CI full-stack profile uses Mailpit to exercise confirmation mail.

## Keep the wiki current

Page sources live in [docs/wiki](https://github.com/julianhoelz94/Verfassung/tree/main/docs/wiki). Every sprint close-out compares its changed behavior and operational steps with these pages. Update affected pages, or record why no text update was needed in the sprint's Linear completion note. After a PR merges into `main`, the [wiki workflow](https://github.com/julianhoelz94/Verfassung/blob/main/.github/workflows/wiki-videos.yml) boots the full Compose stack, uploads API fixtures, records the editorial journey, and publishes the current pages and fresh clips to the GitHub Wiki. Check that workflow and the published links and playback before marking the sprint complete. Add actual site deployment commands only after its separate CD workflow and a production dry run are verified.

The recording source is `apps/gateway-web/e2e/full/wiki-recording.spec.ts`. It signs in using the real identity service before recording, then writes separate editing, review, and publishing clips. For a local rerun, start the full stack with fixtures and run from `apps/gateway-web`:

```sh
./manageLocalStack.sh --start  # from repository root
cd apps/gateway-web
E2E_BASE_URL=http://127.0.0.1:80 \
  ./node_modules/.bin/playwright test --config=playwright.wiki-recording.config.js
```

The files are generated in `docs/wiki/media/`. Check that the test passes and all three clips play, and confirm their steps against the current user-story journey. The merge workflow replaces the wiki copies; PR checks do not write to the wiki. Do not upload Playwright traces or real credentials.

## UI verification coverage

The maintained [Sprint 59 audit](https://github.com/julianhoelz94/Verfassung/blob/main/docs/design/sprint-59-ui-review.md) records every page entry point and its disposition. `e2e/ui-review.spec.ts` checks the route inventory against source, then renders each page in English and German at 390, 820 and 1440px, checking headings, overflow and accessibility. Newer task screens have Linux screenshot baselines alongside the original visual suite; CI runs both suites. `e2e/mfa-review.spec.ts` covers selected-method MFA and secondary correction history. The real-stack account journeys decode the rendered QR pixels, confirm enrollment and verify single-use recovery codes. Real-stack authenticator journeys disable retained traces; mock diagnostics use synthetic secrets.

From `apps/gateway-web`, run `npm run test:e2e` for the mock journeys, and `npm run test:e2e:full` against a fixture-populated stack. Generate or verify screenshot baselines only in the prescribed Linux Playwright image. Inspect changed images before committing them; a baseline update alone is not proof of a usable layout.


## Local setup and HTTPS

A fresh local database uses the same setup restriction and completion rules as production. The local profile explicitly defaults to `TLS_MODE=local-http`, `PUBLIC_BASE_URL=http://localhost`, `SESSION_COOKIE_SECURE=false`, and loopback-bound published ports. No public certificate authority or host trust change is needed. Finish setup before loading content; the stack script then supports `--only-prepopulate` through the real APIs. CI may explicitly select `SETUP_FIXTURE_COMPLETE=true` for existing journeys; production rejects that fixture flag.

For optional local HTTPS, set `TLS_MODE=local-https`, use `PUBLIC_BASE_URL=https://localhost`, and enable secure cookies. Caddy stores its internal CA and certificates in the persistent `caddy-data` volume. Run `scripts/export-local-ca.sh` to export only the public root certificate, review it, then explicitly trust it in your host/browser if desired. The script never installs trust or exports the private key. The container-based fixture loader checks setup completion before authentication and exports only the public root to `.local-stack/local-root.crt` for its Node requests, without disabling certificate validation. Preserve Caddy volumes across rebuilds.

Transport checks include `python3 -m unittest discover -s infra/caddy -p 'test_*.py'`, generated-config validation in `scripts/check-transport-configs.py`, and actual local certificate issuance/trust/persistence in `scripts/test-local-https.py`. These use disposable containers/volumes. The isolated HTTP-01 test in `scripts/test-acme-http01.py` uses the official Pebble ACME server to verify real issuance and explicit challenge failure. `scripts/test-proxy-https.py` verifies proxy trust, scheme rejection and login gating until the public certificate verifies. These private tests do not verify a public Let's Encrypt challenge.
