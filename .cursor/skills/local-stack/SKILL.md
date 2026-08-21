---
name: local-stack
description: Start, stop, and reset the Constitution Atlas Docker Compose stack, env profiles, and local URLs. Use when the user mentions manageLocalStack, local-stack, Caddy, or running services locally.
disable-model-invocation: true
---

# Local stack

```bash
cp env/local-stack.env.example env/local-stack.env   # first time only
./manageLocalStack.sh --start
./manageLocalStack.sh --stop
./manageLocalStack.sh --reset   # destructive prune; only if asked
```

- App: `http://localhost`
- Docs: `http://localhost/api/docs/<catalog|content|amendment|identity|editor|search|ingestion|audit>/swagger-ui/index.html`
- Compose file: `docker-compose.yml`. Builds are sequential in `manageLocalStack.sh` to avoid OOM.
- Profiles: `env/local-stack.env.example`, `ci.env.example`, `testing.env.example`, `production.env.example`.
