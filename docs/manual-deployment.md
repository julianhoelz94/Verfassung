# Manual deployment through GitHub Actions

The workflow is [`.github/workflows/deploy.yml`](../.github/workflows/deploy.yml). It has only a manual trigger. Preparing these files does not deploy anything. The first remote rollout and server restore remain to be verified.

## Run a deployment

After this change is merged into `main`, open **GitHub → Actions → Deploy → Run workflow** as a repository administrator. Select branch `main` and choose:

| Input | Default | Effect |
| --- | --- | --- |
| `environment` | `test` | Selects the GitHub environment, its credentials, Coolify application and public domain |
| `prune_volumes` | `false` | After successful rollout, deletes unused volumes labelled for this application/environment |
| `prune_confirmation` | empty | Required only when pruning: exactly `PRUNE test` or `PRUNE prod` |
| `prepopulate` | `false` | Runs the existing `npm run prepopulate` after rollout, uploading, reviewing, publishing and reading back generated fixture content |

| Environment | Public origin |
| --- | --- |
| `test` | `https://tst.verfassungen.julianhoelz.de` |
| `prod` | `https://verfassungen.julianhoelz.de` |

The source is the fixed `GITHUB_SHA` of the selected `main` dispatch. CD checks the existing push-to-main CI run for that exact commit. The latest attempts of `frontend`, `mcp-server`, `gateway-image`, `full-stack-service-artifacts`, and every `images (<service>)` job must have succeeded. Missing, pending, skipped or failed compilation jobs stop CD; finish CI and dispatch again. CD does not wait for or rerun E2E jobs and does not require their result. These existing jobs include their usual CI checks; CD does not change the normal CI suite.

CD compiles the service JARs using `bootJar -x test` and builds the gateway, MCP and Caddy images on GitHub-hosted `ubuntu-24.04` AMD64 runners. It runs no unit, integration or browser test suite. It publishes twelve images to GHCR and records immutable digests in the `release-candidate` artifact. The build argument for the gateway selects the correct public origin. These are newly compiled images of the CI-checked source, not a reuse of CI's image binaries.

Only the deployment job joins Tailscale, using an ephemeral OIDC identity. It validates the Coolify project/environment/application and edge domain, sets the exact source commit and image digests, disables automatic deployment, starts rollout, polls its deployment UUID and checks public HTTPS setup status. Both environments share a concurrency group so rollouts and optional maintenance do not overlap. Cancellation or a timeout does not undo an already submitted Coolify deployment; inspect its queue before retrying.

## One-time Coolify application setup

The Ubuntu host is `coolify`, running **AMD64**, with 8 vCPUs, 16 GB RAM and 320 GB storage. Keep existing tailnet permissions. Only TCP 80 and 443 are public; dashboard/API and ordinary SSH use Tailscale. See the [server guide](coolify-server-setup.md).

1. In one Coolify project, create environments named exactly `test` and `prod` and a separate Git-based **Docker Compose** application in each. Point each at `https://github.com/julianhoelz94/Verfassung`, branch `main`, Compose path `/docker-compose.coolify.yml`. A public repository does not need a source deploy key.
2. Disable automatic deployments, preview deployments and incoming deployment webhooks. Do not enable raw Compose mode or preserve the source checkout. Do not select the development `docker-compose.yml`.
3. Load the Compose definition. Assign the environment's HTTPS domain **only to `edge-proxy` on internal port 80**, for example `https://verfassungen.julianhoelz.de:80` for production. Leave domains on other services empty. Coolify owns TLS and routes to Caddy; Caddy retains API authorization and routing.
4. Create the persistent application environment values listed below. Use separate passwords, encryption keys and credentials in test and production. CD supplies the `ATLAS_IMAGE_*`, `ATLAS_APPLICATION_UUID`, `ATLAS_DEPLOYMENT_ENVIRONMENT`, public-origin and transport values when a release is selected. Before the first run, ensure both applications have distinct UUIDs and belong to the intended environments.
5. Ensure Coolify's host management user can pull the GHCR images. New packages can be private even when their source repository is public. For private packages, use a classic PAT with `read:packages` for the host's registry login as described in server-guide step 10. CD publishes with its job's `GITHUB_TOKEN`; no publish PAT is needed.

Required persistent Coolify application values:

| Name | Purpose |
| --- | --- |
| `POSTGRES_PASSWORD` | Strong database password, kept stable across deployments |
| `IDENTITY_MFA_ENCRYPTION_KEY` | Stable encryption key for persisted MFA credentials |
| `PROD_ADMIN_EMAIL`, `PROD_ADMIN_PASSWORD` | First administrator, using the production runtime profile in both environments |
| `TLS_TRUSTED_PROXIES` | Actual Coolify proxy address/CIDRs that Caddy may trust; inspect the proxy's Docker network |
| `PUBLIC_BASE_URL` | The environment's HTTPS origin from the table above |
| `ATLAS_DEPLOYMENT_ENVIRONMENT`, `ATLAS_APPLICATION_UUID` | Selected environment and that application's UUID; CD also sets them |

The runtime definition preserves the canonical services' other configuration, including SMTP and internal service credentials. Configure those in Coolify when used. Complete site setup in the browser after the first deployment, including administrator security and real site settings. Demo account seeding stays off and API docs stay closed. Fixture accounts for optional prepopulate are created separately; deployment does not create them.

`docker-compose.coolify.yml` contains only image references and internal networking, with no host port publications or checkout bind mounts. Each database retains its named volume in the Coolify application's Compose project. No `backup-service` or backup image runs on this host: backup is provided at host level. CD does not create a pre-deployment backup, restore data or reverse migrations. Host backup and restore consistency are operator responsibilities.

Keep runtime wiring in `docker-compose.yml`, then regenerate the deployment file with:

```bash
python3 -m pip install PyYAML==6.0.2
python3 scripts/cd/render_compose.py
```

Normal CI checks this generated file for drift.

## GitHub environments and Tailscale identity

Create GitHub environments **test** and **prod**, each restricted to branch **main**. Use required reviewers if desired. The workflow also checks that both the initial actor and the rerunning actor are repository administrators.

Set these **environment variables** in each:

| Name | Value |
| --- | --- |
| `COOLIFY_URL` | Private Tailscale origin, e.g. `http://100.x.y.z:8000`, with no `/api/v1` path |
| `COOLIFY_PROJECT_UUID` | Project UUID from Coolify |
| `COOLIFY_APP_UUID` | Different application UUID for test/prod |
| `PUBLIC_BASE_URL` | Exact HTTPS origin for that environment |
| `TS_CLIENT_ID`, `TS_AUDIENCE` | Existing Tailscale federated identity identifiers |
| `TS_TAGS` | `tag:github-deploy` |

Set these **environment secrets**:

| Name | Permissions |
| --- | --- |
| `COOLIFY_DEPLOY_TOKEN` | Coolify `deploy` |
| `COOLIFY_CONFIG_TOKEN` | Coolify `read` and `write` |

One Tailscale trust credential can cover both environments with subject `repo:julianhoelz94@26120868/Verfassung@1341839964:environment:*`. Retain claim restrictions for repository `julianhoelz94/Verfassung`, ref `refs/heads/main` and workflow_ref `julianhoelz94/Verfassung/.github/workflows/deploy.yml@refs/heads/main`. Allow authentication-key write access for `tag:github-deploy`. No reusable Tailscale auth key, OAuth secret or custom tailnet access rules are added. [Tailscale action OIDC inputs](https://tailscale.com/docs/integrations/github/github-action)

## Optional volume pruning

This removes **unused** named/anonymous volumes with the single label `io.constitution-atlas.deployment=<environment>:<application-uuid>`. Docker retains volumes referenced by running or stopped containers. Current databases are not reset, containers are not stopped or deleted, and unlabeled or other-app volumes are excluded. Old volumes containing data can still be permanently deleted. [Docker volume prune](https://docs.docker.com/reference/cli/docker/volume/prune/)

Do this extra setup only if you want the checkbox:

1. On your trusted workstation, generate a separate unencrypted Ed25519 key for this forced command. Keep your normal administration key separate.
2. Copy [scripts/cd/prune_volumes.py](../scripts/cd/prune_volumes.py) to the host and install it as root-owned `/usr/local/sbin/atlas-prune-volumes` with mode `0755`; Ubuntu must have Python 3. Do not give the CI key a general shell.
3. Add its public key to root's `/root/.ssh/authorized_keys` with this exact prefix on the same line:

   ```text
   restrict,command="/usr/local/sbin/atlas-prune-volumes" ssh-ed25519 YOUR_PUBLIC_KEY github-volume-prune
   ```

4. Store the private key as GitHub environment secret `COOLIFY_SSH_PRIVATE_KEY`. Store a pinned known-hosts entry for the **same Tailscale hostname/IP used in `COOLIFY_URL`** as `COOLIFY_SSH_KNOWN_HOSTS`. Obtain the host's public SSH host key through your existing trusted SSH session/provider console; do not blindly trust a fresh network scan. For example, read `/etc/ssh/ssh_host_ed25519_key.pub` there and prepend `100.x.y.z` to its key type and public-key text in the known-hosts secret.
5. Leave the checkbox off for normal deployments. To prune, select it and enter the matching confirmation. Missing key material or a mismatched confirmation stops deployment before configuration is changed. Pruning runs only after Coolify reports success and the public HTTPS check passes. A prune failure leaves the rollout in place and fails the workflow as a maintenance failure.

The forced command validates its environment/application arguments and takes an exclusive maintenance lock. A single composite Docker label is intentional: repeated positive `label` filters can be combined with OR semantics. No server-wide cleanup API is called.

## Optional npm prepopulate

The `prepopulate` checkbox invokes the existing fixture generation/import/publish/read-back script. This writes **generated sample constitutional content**, can create countries/versions and rebuilds the search index. It is available for either selected environment, defaults off, and is not an E2E test run.

Complete the site's setup wizard and create three distinct accounts with administrator/import, reviewer and publisher capabilities before choosing it. Existing review/publication boundaries remain enforced. Store these **environment secrets** for the selected site:

```text
PREPOPULATE_ADMIN_EMAIL
PREPOPULATE_ADMIN_PASSWORD
PREPOPULATE_TOTP_SECRET
PREPOPULATE_REVIEWER_EMAIL
PREPOPULATE_REVIEWER_PASSWORD
PREPOPULATE_REVIEWER_TOTP_SECRET
PREPOPULATE_PUBLISHER_EMAIL
PREPOPULATE_PUBLISHER_PASSWORD
PREPOPULATE_PUBLISHER_TOTP_SECRET
```

TOTP secrets are needed for accounts with TOTP MFA; they are the enrollment secrets, not the current six-digit codes. WebAuthn-only accounts cannot authenticate this script; use accounts supporting its password/TOTP path. Password credentials are required before a selected run can deploy. Missing MFA credentials or incomplete site setup fail the optional post-deployment step; the successful rollout is retained. Create these credentials through normal site administration rather than enabling demo seed accounts.

CD sets the explicit target environment and canonical HTTPS origin. The script rejects arbitrary remote origins and a test/prod mismatch; its existing localhost path remains available for development/CI. It uses the same source checkout as the release and needs only Node/npm for this command, without downloading browsers or running `npm install`.

## Release recovery and first-rollout evidence

The `release-candidate` artifact contains `manifest.json` and an image override for inspection. Record its source SHA, digests, Coolify deployment UUID, domain and outcome. Keep any release needed for rollback beyond the artifact's 30-day retention. Coolify may retain earlier releases, but choosing earlier images does not roll back databases or schema migrations. Use your host backup recovery procedure when state recovery is required.

For the first rollout, verify TLS, all services' health in Coolify, setup completion, authentication and persisted content across a second manual deployment. E2E remains in normal CI, outside CD. Public launch also retains the real legal-details gate tracked in [VER-269](https://linear.app/verfassung/issue/VER-269/publish-verified-legal-details-and-check-german-hosting-before-public). The production procedure remains unverified until these operator checks are exercised on the host.
