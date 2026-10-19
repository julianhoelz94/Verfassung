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
python3 scripts/test_local_stack.py
python3 scripts/check-wiki-docs.py
```

For the gateway, run `npm test`, `npm run lint`, `npm run build` and the relevant browser journeys from `apps/gateway-web`. The [CI workflow](https://github.com/julianhoelz94/Verfassung/blob/main/.github/workflows/ci.yml) also covers service/image builds, publication and real-stack browser journeys. [[Operations reference|Operations-Reference]] covers UI/QR verification and transport checks.

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

## Maintain the Wiki

Edit [docs/wiki](https://github.com/julianhoelz94/Verfassung/tree/main/docs/wiki) with the affected feature. Each sprint close-out must update the relevant pages or record why no update was needed in Linear.

**Illustrations and videos refresh only in merged-PR CI.** Ordinary PR checks validate guide links and capture code without updating published media. The merge workflow captures both languages, verifies media and browser playback, deploys the player, then publishes pages and embedded images to the Wiki. See [[Media maintenance|Media-Maintenance]] for sources, verification and recovery.

Production deployment remains [[pending|Deployment-Information]] until a site CD workflow and verified production procedure exist. The static video player does not deploy the application.
