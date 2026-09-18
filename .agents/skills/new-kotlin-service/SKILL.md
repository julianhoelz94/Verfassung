---
name: new-kotlin-service
description: Scaffold a Kotlin Spring Boot service, including its database, Docker, Caddy, and CI wiring.
---

Copy a current sibling service's Gradle, Docker, app, Flyway, and Testcontainers layout. Reuse `services/platform` for shared filter, exceptions, and identity client. Give a stateful service its own Compose database; add it to `manageLocalStack.sh` build order, Caddy docs routing, and CI matrix. Run its tests. Follow `services/AGENTS.md`; do not add unrequested future services.
