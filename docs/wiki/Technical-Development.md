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

## Navigate the code

| Area | Start here |
| --- | --- |
| Repository navigation | [CODEMAPS/INDEX.md](https://github.com/julianhoelz94/Verfassung/blob/main/docs/CODEMAPS/INDEX.md) |
| Website | `apps/gateway-web` |
| Service | `services/<name>`; each owns its database and Flyway migrations |
| Edge routing | `infra/caddy` |
| Boundary and version rules | [[Architecture|Technical-Architecture]] and linked ADRs |

Check maps against code. Never edit an applied migration.

Shared Kotlin HTTP deadlines live in `services/platform` (2 s connect, 5 s read by default). Domain clients own authentication; import publication delivery explicitly keeps a 60 s read deadline. Content, Editor and Ingestion opt into the same bounded JSON reader. Gateway requests use a shared 10 s deadline while retaining caller cancellation and shorter limits. Translation batches allow 30 s and document streaming allows 60 s; write commands are not retried automatically. TypeScript rejects unused locals and parameters in both Node projects. The repository hygiene check rejects generated artifacts and exact Kotlin implementation copies outside imports/packages.

For host Testcontainers tests, set `DOCKER_HOST` to the socket reported by `docker context inspect --format '{{.Endpoints.docker.Host}}'` if the default Unix socket is absent. OrbStack helper containers use `TESTCONTAINERS_DOCKER_SOCKET_OVERRIDE=/var/run/docker.sock`.

## Maintain the Wiki

Edit [docs/wiki](https://github.com/julianhoelz94/Verfassung/tree/main/docs/wiki) with the affected feature. Each sprint close-out must update the relevant pages or record why no update was needed in Linear.

**Illustrations and videos refresh only in merged-PR CI.** Ordinary PR checks validate guide links and capture code without updating published media. The merge workflow captures both languages, verifies media and browser playback, deploys the player, then publishes pages and embedded images to the Wiki. See [[Media maintenance|Media-Maintenance]] for sources, verification and recovery.

Production deployment remains [[pending|Deployment-Information]] until a site CD workflow and verified production procedure exist. The static video player does not deploy the application.
