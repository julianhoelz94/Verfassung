# Development and operations

**First run:** install a Docker-compatible engine with Compose, Bash and curl; start the stack and open http://localhost. Java and Node on the host are optional for container builds.

## Start or update the local stack

```sh
cp env/local-stack.env.example env/local-stack.env  # once; keep secrets out of Git
./manageLocalStack.sh --start
./manageLocalStack.sh --status
./manageLocalStack.sh --stop  # keeps database volumes
```

| Task | Command |
| --- | --- |
| Restart existing images | `./manageLocalStack.sh --start --no-build` |
| Apply source changes | `./manageLocalStack.sh --rebuild <service...>` |
| Upload fixtures to a running local stack | `./manageLocalStack.sh --only-prepopulate` |
| Verify saved fixtures without uploading | `./manageLocalStack.sh --only-prepopulate --verify-only` |
| Inspect build records | `docker buildx history ls` or OrbStack's build-monitor Logs |

The script builds images serially, checks all nine service health endpoints and uploads deterministic API fixtures. A daemon-wide lock prevents overlapping builds. `--reset` removes database volumes. Full build/fixture and backup/restore details: [[Local stack reference|Local-Stack-Reference]].

## Verify a change

Run from the repository root:

```sh
./gradlew -p services/<name> check
python3 scripts/check-repository-hygiene.py
python3 scripts/test_backup_restore.py
python3 scripts/test_local_stack.py
python3 scripts/check-wiki-docs.py
```

For the gateway, run `npm test`, `npm run typecheck`, `npm run lint`, `npm run build` and the relevant browser journeys from `apps/gateway-web`. The [CI workflow](https://github.com/julianhoelz94/Verfassung/blob/main/.github/workflows/ci.yml) also covers service/image builds, publication and real-stack browser journeys. [[Operations reference|Operations-Reference]] covers UI/QR verification and transport checks.

Enabled local/CI API docs: `/api/docs/<service>/swagger-ui/index.html` with `CADDY_EXPOSE_API_DOCS=true`.

## Upgrade dependencies

Review the weekly Dependabot queue as related packages: Kotlin and the backend framework across all services, React with DOM/types, and Next with its lint configuration. The [dependency inventory](https://github.com/julianhoelz94/Verfassung/blob/main/docs/dependencies.md) records current pins. Follow the [upgrade checklist](https://github.com/julianhoelz94/Verfassung/blob/main/docs/dependency-upgrades.md): validate one consumer first, then every changed service/app and the complete CI journeys before merge. A grouped PR still needs compatibility review.

Keep runtime images, CI, toolchains and Node type packages aligned. Java 21 and Node 22 remain the runtime baseline during the coordinated framework migration. MCP uses the native TypeScript 7 compiler; gateway TypeScript remains on its separately validated version. The Boot 4 migration preserves previous JSON property order, null handling and date formats, including the separate HTTP-client defaults. Fixed pre-upgrade import fixtures protect checksums already stored in the database; retain those contracts when revisiting mapper settings.

## Navigate the code

| Area | Start here |
| --- | --- |
| Repository navigation | [CODEMAPS/INDEX.md](https://github.com/julianhoelz94/Verfassung/blob/main/docs/CODEMAPS/INDEX.md) |
| Website | `apps/gateway-web` |
| Service | `services/<name>`; each owns its database and Flyway migrations |
| Edge routing | `infra/caddy` |
| Boundary and version rules | [[Architecture|Technical-Architecture]] and linked ADRs |

Check maps against code. Never edit an applied migration.

## Build website layouts

The gateway uses reusable React page templates and scoped vanilla CSS. Choose `FocusedPage`, `SettingsPage`, `CollectionPage`, `ReaderPage` or `WorkspacePage` from `app/components/layout/templates.tsx`. Routes keep data loading, authorization and actions. Templates provide consistent headers, widths, notices and responsive page structure.

Use `Stack`, `Inline`, `Grid` and `Section` for layout. The parent owns the gap between children, cards own their padding, and fields own label/control/help/error grouping. Keep runtime tokens in `app/styles/tokens.css`; avoid adding margins for a gap the parent already controls. Public and preview views keep the same legal-text renderer. The [UI template guide](https://github.com/julianhoelz94/Verfassung/blob/main/docs/design/ui-templates.md) documents template selection, semantic spacing, accessible fields and responsive checks.

Verify English and German at 390/820/1440px and narrow reflow at 320px. The browser suite checks all route fixtures and shared settings spacing. Inspect Linux screenshot differences before updating their baselines, and retain workflow/journey checks for interactions.

Shared Kotlin HTTP deadlines live in `services/platform` (2 s connect, 5 s read by default). Domain clients own authentication; import publication delivery explicitly keeps a 60 s read deadline. Content, Editor and Ingestion opt into the same bounded JSON reader. Gateway requests use a shared 10 s deadline while retaining caller cancellation and shorter limits. Translation batches allow 30 s and document streaming allows 60 s; write commands are not retried automatically. TypeScript rejects unused locals and parameters in both Node projects. The repository hygiene check rejects generated artifacts and exact Kotlin implementation copies outside imports/packages.

WebAuthn browser tests need a DNS hostname that matches `PUBLIC_BASE_URL`; the full-stack suite uses `http://localhost:18080`. Chromium rejects raw IP relying-party IDs, including `127.0.0.1`. OAuth resources and mail links derive the same configured test origin.

For host Testcontainers tests, set `DOCKER_HOST` to the socket reported by `docker context inspect --format '{{.Endpoints.docker.Host}}'` if the default Unix socket is absent. OrbStack helper containers use `TESTCONTAINERS_DOCKER_SOCKET_OVERRIDE=/var/run/docker.sock`.

Identity serializes credential issuance and revocation on the owner's PostgreSQL row. Recheck session/code/credential validity after acquiring the lock: a request waiting behind a reset must not mint credentials. Authentication failure counters increment atomically and survive rejected authentication transactions. Factor freshness comes from stored session proof for every role. Caddy pins its computed peer address on gateway and Identity routes; server actions and Identity trust only that pinned header, never the raw forwarded chain. Keep internal service ports private. Enabling API documentation also exposes Swagger API aliases; those aliases retain the canonical anonymous-access policy, write guards and trusted peer headers. Disabled documentation stays closed with 404. The transport validator checks these replacements in all four modes, and the real external-proxy test sends forged chains and duplicate headers through a trusted upstream. See the [Sprint 60 security review](https://github.com/julianhoelz94/Verfassung/blob/main/docs/design/sprint-60-identity-security.md) for attack reproductions and regression evidence.

## Maintain the Wiki

Edit [docs/wiki](https://github.com/julianhoelz94/Verfassung/tree/main/docs/wiki) with the affected feature. Each sprint close-out must update the relevant pages or record why no update was needed in Linear.

**Illustrations and videos refresh only in merged-PR CI.** Ordinary PR checks validate guide links and capture code without updating published media. The merge workflow captures both languages, verifies media and browser playback, deploys the player, then publishes pages and embedded images to the Wiki. See [[Media maintenance|Media-Maintenance]] for sources, verification and recovery.

Production deployment remains [[pending|Deployment-Information]] until a site CD workflow and verified production procedure exist. The static video player does not deploy the application.

## Code coverage in CI

Every CI run publishes **whole-repository line coverage** and **new-code line
coverage** in the `coverage` job summary and the downloadable `code-coverage`
artifact. Open `index.html` for original source lines, `summary.json` for machine
readable statistics, and `jvm-html/index.html` for the detailed JVM report. Component
line and branch coverage, the exact tested revision/comparison base, and uncovered
changed lines are included. Migration inventory coverage is a separate artifact.

The required `ci-status` check includes the coverage gate. Added or changed executable
production lines must reach **at least 80% line coverage**, using the unrounded
ratio. Whole-repository line coverage must also reach **80%**. The committed
`scripts/code_coverage/minimums.json` policy sets component floors so a strong
component cannot hide a regression elsewhere. Floors use exact covered/eligible
ratios, not rounded display percentages. A change with no executable production
lines reports **N/A** for new code; overall and component floors still apply.
Missing, incomplete or stale inputs fail the coverage job and cannot produce a
passing percentage.

PRs compare with the merge base of the target revision from the event. Main pushes
compare with the previous pushed `main` revision, verifying the actual merged
result; the PR gate is what prevents a merge below the minimum. Renamed source
paths count as newly introduced files. Successful inputs from an earlier attempt
of the same run/revision may be reused when rerunning failed jobs; inputs from
another run or source revision are rejected.

The denominator includes Kotlin service/platform production sources, gateway
`app`, `lib` and `proxy` TypeScript/JavaScript (including legacy `middleware` entry points), MCP TypeScript, and Python
operational tooling. It excludes tests, fixtures, generated output, declaration
files, dependencies, CSS, SQL migrations, shell scripts and build configuration.
Coverage reflects instrumented service/unit tests and Python execution from the
real publication, transport and recovery acceptance checks. Browser and visual
checks remain separate required gates. Existing acceptance execution newly added
to collection must be distinguished from new behavioral tests. Execution alone
does not establish that a requirement is asserted correctly.

New tests must identify their specification: accepted ADRs, documented role/workflow
rules or service HTTP contracts. Use independently authored inputs and expected
outcomes, cover rejected and interrupted actions, and assert forbidden side effects.
A discrepancy between implementation and specification is investigated as a defect;
expectations are not rewritten merely to make the suite pass. Representative
controlled faults must demonstrate that important assertions reject unwanted
behavior. See the [specification test inventory](https://github.com/julianhoelz94/Verfassung/blob/main/docs/design/specification-test-coverage.md).

JVM probes from all services and platform tests are merged before JaCoCo analyzes
each production class once. Platform coverage therefore includes service-test
observations without multiplying its denominator. JavaScript source maps resolve
to original tracked files. Python observations combine before reporting. The
aggregate merges repeated source-line observations with covered-if-any semantics
and includes files that no test imports.

Local collection:

```sh
./gradlew -p services/<name> check jacocoTestReport
# In apps/gateway-web or services/mcp-server:
npm run test:coverage
# Python checks (Python 3.10+, in a temporary virtual environment):
python -m pip install coverage==7.17.0 PyYAML==6.0.2
python -m coverage run --parallel-mode scripts/code_coverage/run_python.py
python -m coverage combine
python -m coverage json
```

The CI workflow packages commit-bound collector inputs, validates the complete
source inventory, runs `./gradlew repositoryCoverage`, and executes
`python3 scripts/code_coverage/coverage_report.py report --event "$GITHUB_EVENT_PATH" --minimum 80 --policy scripts/code_coverage/minimums.json`.
Use `--base <revision>` in place of `--event` for a local aggregate. See the
[Sprint 67 measurement policy](https://github.com/julianhoelz94/Verfassung/blob/main/docs/design/sprint-67-ci-code-coverage.md)
for the original measurement scope; the specification test inventory defines the
follow-up regression and overall-floor policy.
