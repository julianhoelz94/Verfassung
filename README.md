# Constitution Atlas

Browse constitutional texts by country and legal version, search and compare provisions, and follow changes in law. Editorial teams can draft, review and publish content while preserving earlier snapshots.

## Documentation

| I want to… | Guide |
| --- | --- |
| Use the website | [Read and compare](https://github.com/julianhoelz94/Verfassung/wiki/User-Guide) · [Deutsch](https://github.com/julianhoelz94/Verfassung/wiki/User-Guide-de) |
| Manage my account | [Accounts and security](https://github.com/julianhoelz94/Verfassung/wiki/Account-Guide) |
| Edit, review or publish | [Editorial guide](https://github.com/julianhoelz94/Verfassung/wiki/Editorial-Guide) · [Video walkthroughs](https://julianhoelz94.github.io/Verfassung/) |
| Configure the website | [Administration and setup](https://github.com/julianhoelz94/Verfassung/wiki/Admin-Guide) |
| Develop locally | [Development guide](https://github.com/julianhoelz94/Verfassung/wiki/Technical-Development) · [Architecture](https://github.com/julianhoelz94/Verfassung/wiki/Technical-Architecture) |

[All guides](https://github.com/julianhoelz94/Verfassung/wiki) · [Current work in Linear](https://linear.app/verfassung)

## Run locally

Install a Docker-compatible engine with Compose ([OrbStack](https://orbstack.dev/) or [Docker Desktop](https://www.docker.com/products/docker-desktop/)), Bash and curl. Docker builds the application and uploads development fixtures; host Java and Node installations are optional.

```sh
cp env/local-stack.env.example env/local-stack.env  # once; never commit secrets
./manageLocalStack.sh --start
```

Open [http://localhost](http://localhost). The stack uses fictional fixtures and seed accounts from the local environment file. See [first installation](https://github.com/julianhoelz94/Verfassung/wiki/Admin-Guide#first-installation) for setup behavior.

```sh
./manageLocalStack.sh --status
./manageLocalStack.sh --start --no-build
./manageLocalStack.sh --rebuild gateway-web
./manageLocalStack.sh --only-prepopulate --verify-only
./manageLocalStack.sh --stop  # keeps database volumes
```

Build behavior, fixtures, profiles and backup/restore drills: [local stack reference](https://github.com/julianhoelz94/Verfassung/wiki/Local-Stack-Reference). Production instructions remain [pending](https://github.com/julianhoelz94/Verfassung/wiki/Deployment-Information) until CD and a verified rollout exist.

## Develop and verify

For host checks, use **JDK 21**, the repository's **Gradle wrapper**, and **Node 20**. See [dependency pins](docs/dependencies.md).

```sh
./gradlew -p services/<name> check
cd apps/gateway-web
npm ci
npm test
npm run lint
npm run build
```

Backend tests use Testcontainers and need Docker. Services are independent Gradle projects. Enabled local/CI API docs: `http://localhost/api/docs/<service>/swagger-ui/index.html`.

| Path | Responsibility |
| --- | --- |
| `apps/gateway-web/` | Next.js website and browser journeys |
| `services/` | Kotlin/Spring services and MCP server |
| `infra/` | Caddy, local builds and backup tools |
| `env/` | Environment templates |
| `docs/wiki/` | Wiki sources; CI refreshes illustrations and videos after merges |
| `docs/CODEMAPS/INDEX.md` | [Code navigation](docs/CODEMAPS/INDEX.md) |

Each stateful service owns its Postgres database. See [platform boundaries](docs/adr/0001-platform-boundaries.md), [versioning](docs/adr/0005-two-axis-versions.md) and [editorial permissions](docs/editorial-roles.md). `backlog.md` is historical; current work is tracked in Linear.
