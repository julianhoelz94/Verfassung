---
name: local-stack
description: Start, stop, rebuild, or reset the local Docker Compose stack.
---

Use `./manageLocalStack.sh --start|--stop|--rebuild <service...>`. First run: copy `env/local-stack.env.example` to `env/local-stack.env`. App: `http://localhost`; Swagger: `/api/docs/<service>/swagger-ui/index.html`. See `docs/CODEMAPS/infra.md`. `--reset` removes volumes; use it or `--prune` only when requested.
