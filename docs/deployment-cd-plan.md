# Manual CD architecture

Updated: 24 October 2026.

The implementation and operator instructions are in [Manual deployment](manual-deployment.md). Server bootstrap remains in [Coolify server setup](coolify-server-setup.md). These files have not deployed the application; first-rollout verification is pending.

## Current decisions

- Server `coolify`: AMD64, 8 vCPUs, 16 GB RAM, 320 GB storage; Ubuntu 24.04 LTS.
- Public TCP 80 and 443 only. Coolify API/dashboard and SSH through the existing trusted Tailscale network; no custom access controls.
- Manual GitHub `workflow_dispatch` only, repository administrators, deployment workflow and application source from the selected published GitHub release tag; branch dispatches, including `main`, are rejected, selectable GitHub environment `test` or `prod`. The tag is resolved once to a commit SHA used throughout CI validation, image building and rollout.
- Test origin: `https://tst.verfassungen.julianhoelz.de`; production origin: `https://verfassungen.julianhoelz.de`.
- Wait up to 45 minutes for existing CI compilation jobs for the exact dispatch SHA, polling every 30 seconds; proceed only after every required compilation check succeeds. Failed checks in the current compilation attempt stop CD immediately. Do not rerun unit, integration or E2E suites in CD; E2E outcomes are not a CD gate.
- Discover twelve image packages and compile/package one per GitHub-hosted AMD64 runner, with at most six runners in parallel. Publish immutable GHCR digests. Assemble the release manifest only after all image jobs succeed and all twelve artifacts match the repository, source SHA, environment, architecture and workflow run. No source compilation on the Coolify host and no test suite execution in CD.
- Failed-job reruns retain successful image artifacts from the same workflow run and replace the rebuilt images' artifacts. The collector accepts mixed attempts only for that same run/source/environment. New manual dispatches build the complete image set again.
- Join Tailscale ephemerally with GitHub OIDC; validate the project/environment/server and required shared-variable names; create or reuse its application, configure the HTTPS edge route and exact digests, request deployment and poll its UUID, then check public HTTPS readiness. The first manual run creates the application without requiring an application UUID.
- Keep persistent credentials in Coolify environment-wide shared variables; CD installs references without needing sensitive-read access. Required Compose interpolation values are available during preparation and runtime.
- Separate Coolify applications/Compose projects and persistent volumes for test and prod. Coolify owns TLS; the application's Caddy remains behind it in external-proxy mode. CD verifies the default managed/read-only container labels rather than sending unsupported released-API settings, and relies on the server's default Let's Encrypt resolver.
- Host-level backup is provided by the operator. No backup container runs in the Coolify deployment. CD does not back up or restore persistent state.
- Optional `npm run prepopulate`, default false, after successful deployment. The profile selector defaults to compact; extended and scale include exploration scenarios and preserve a deployment journal across runs. The workflow verifies the selected profile afterward. All profiles require completed site setup and the existing administrator's email, current password and TOTP setup key in GitHub environment secrets. CD checks private-work access anonymously; CI retains separate role accounts for permission tests.

The [manual deployment runbook](manual-deployment.md) defines the required variables, secrets, trust credential, optional actions and recovery boundaries. Published production setup remains pending until the first remote procedure has been exercised and verified.
