# Infrastructure

Caddy is the sole public entry point; service APIs use `/api/<service>*` and docs use `/api/docs/<service>*`. State stays in each service's own Postgres database. Kotlin images use host `bootJar` plus `eclipse-temurin:21-jre`; gateway and Caddy build in Docker. Keep real env files uncommitted. `--reset` removes volumes and `--prune` also prunes Docker system state; use only when requested. See [`infra map`](../docs/CODEMAPS/infra.md).
