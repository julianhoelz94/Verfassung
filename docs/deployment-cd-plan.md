# Manual CD architecture

Updated: 24 October 2026.

The implementation and operator instructions are in [Manual deployment](manual-deployment.md). Server bootstrap remains in [Coolify server setup](coolify-server-setup.md). These files have not deployed the application; first-rollout verification is pending.

## Current decisions

- Server `coolify`: AMD64, 8 vCPUs, 16 GB RAM, 320 GB storage; Ubuntu 24.04 LTS.
- Public TCP 80 and 443 only. Coolify API/dashboard and SSH through the existing trusted Tailscale network; no custom access controls.
- Manual GitHub `workflow_dispatch` only, repository administrators, `main` branch, selectable GitHub environment `test` or `prod`.
- Test origin: `https://tst.verfassungen.julianhoelz.de`; production origin: `https://verfassungen.julianhoelz.de`.
- Check existing CI compilation jobs for the exact dispatch SHA. Do not rerun unit, integration or E2E suites in CD; E2E outcomes are not a CD gate.
- Compile and package twelve AMD64 images on GitHub-hosted runners, publish immutable GHCR digests and record a release manifest. No source compilation on the Coolify host.
- Join Tailscale ephemerally with GitHub OIDC; validate the project/environment/server and required shared-variable names; create or reuse its application, configure the HTTPS edge route and exact digests, request deployment and poll its UUID, then check public HTTPS readiness. The first manual run creates the application without requiring an application UUID.
- Keep persistent credentials in Coolify environment-wide shared variables; CD installs references without needing sensitive-read access. Required Compose interpolation values are available during preparation and runtime.
- Separate Coolify applications/Compose projects and persistent volumes for test and prod. Coolify owns TLS; the application's Caddy remains behind it in external-proxy mode.
- Host-level backup is provided by the operator. No backup container runs in the Coolify deployment. CD does not back up or restore persistent state.
- Optional `npm run prepopulate`, default false, after successful deployment. It publishes generated fixture data using separate accounts and requires completed site setup.

The [manual deployment runbook](manual-deployment.md) defines the required variables, secrets, trust credential, optional actions and recovery boundaries. Published production setup remains pending until the first remote procedure has been exercised and verified.
