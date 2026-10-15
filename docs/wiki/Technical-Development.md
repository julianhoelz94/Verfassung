# Development and operations

This page is for local development and verification. [[Deployment information|Deployment-Information]] remains pending until CD and a production runbook exist.

## Navigate the code

Start at [CODEMAPS/INDEX.md](https://github.com/julianhoelz94/Verfassung/blob/main/docs/CODEMAPS/INDEX.md), choose the relevant area map, and then verify it against the current code. `apps/gateway-web` contains the Next.js UI; `services/<name>` contains independent Spring Boot projects; `infra/caddy` routes public traffic. Flyway migrations live within the owning service and applied migrations must not be edited.

## Run the local stack

Install a Docker-compatible engine, JDK 21, and Node 20. From the repository root:

```sh
cp env/local-stack.env.example env/local-stack.env  # once; keep real values out of git
./manageLocalStack.sh --start
./manageLocalStack.sh --status
./manageLocalStack.sh --stop                     # keeps database volumes
```

The local start flow builds service jars and images and can upload test fixtures. `--start --no-build` reuses images; `--rebuild <service...>` applies source changes; `--only-prepopulate` runs the API-based fixture upload against an already running stack. `--reset` removes local database volumes and is destructive. See the [README](https://github.com/julianhoelz94/Verfassung/blob/main/README.md) and [stack script](https://github.com/julianhoelz94/Verfassung/blob/main/manageLocalStack.sh) for current flags and prerequisites.

## Verify changes

```sh
cd services/<name> && ./gradlew test     # changed service
cd services/<name> && ./gradlew check    # includes formatting checks
cd apps/gateway-web && npm run lint && npm run build
```

CI also runs service checks, gateway tests and builds, image builds, publication checks, and browser journeys. Check the current [CI workflow](https://github.com/julianhoelz94/Verfassung/blob/main/.github/workflows/ci.yml) for required jobs. API docs are exposed by Caddy only when `CADDY_EXPOSE_API_DOCS=true` in the applicable local/CI profile, at `/api/docs/<service>/swagger-ui/index.html`.

## Data and recovery

Each service's Postgres database must be backed up with its migration history. The local [backup and restore scripts](https://github.com/julianhoelz94/Verfassung/tree/main/infra/backup) support development drills; restoring replaces data and is not a production runbook. Search and Audit are derived or secondary records; do not treat either as the canonical source for published constitutional text. Reindex Search after changes that affect published text or metadata using the supported application flow.

## Keep the wiki current

Page sources live in [docs/wiki](https://github.com/julianhoelz94/Verfassung/tree/main/docs/wiki). Every sprint close-out compares its changed behavior and operational steps with these pages. Update affected pages and publish the matching wiki revisions, or record why no text update was needed in the sprint's Linear completion note. Regenerate the editorial walkthrough videos from the current Playwright journey on every completed sprint, check playback and step accuracy, and publish the replacement files with the pages. Verify navigation and links after publishing. Add actual deployment commands only after the CD workflow and a production dry run are verified.

The recording source is `apps/gateway-web/e2e/wiki-recording.spec.ts`. It signs in using the local mock fixture before recording, then writes separate editing, review, and publishing clips. From `apps/gateway-web`, with dependencies installed and free local ports:

```sh
E2E_MOCK_PORT=4410 E2E_WEB_PORT=3410 \
  ./node_modules/.bin/playwright test --config=playwright.wiki-recording.config.js
```

The files are generated in `docs/wiki/media/`. Check that the test passes and all three clips play, confirm their steps against the current user-story journey, and replace the wiki copies during sprint close-out. Do not upload Playwright traces or real credentials.
