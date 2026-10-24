# Manual deployment through GitHub Actions

The workflow is [`.github/workflows/deploy.yml`](../.github/workflows/deploy.yml). It has only a manual trigger. Preparing these files does not deploy anything. The first remote rollout and server restore remain to be verified.

## Run a deployment

After this change is merged into `main`, open **GitHub → Actions → Deploy → Run workflow** as a repository administrator. Select branch `main` and choose:

| Input | Default | Effect |
| --- | --- | --- |
| `environment` | `test` | Selects the GitHub environment, its credentials, Coolify application and public domain |
| `prepopulate` | `false` | Runs the existing `npm run prepopulate` after rollout, uploading, reviewing, publishing and reading back generated fixture content |

| Environment | Public origin |
| --- | --- |
| `test` | `https://tst.verfassungen.julianhoelz.de` |
| `prod` | `https://verfassungen.julianhoelz.de` |

The source is the fixed `GITHUB_SHA` of the selected `main` dispatch. CD checks the existing push-to-main CI run for that exact commit. The latest attempts of `frontend`, `mcp-server`, `gateway-image`, `full-stack-service-artifacts`, and every `images (<service>)` job must have succeeded. Missing, pending, skipped or failed compilation jobs stop CD; finish CI and dispatch again. CD does not wait for or rerun E2E jobs and does not require their result. These existing jobs include their usual CI checks; CD does not change the normal CI suite.

CD compiles the service JARs using `bootJar -x test` and builds the gateway, MCP and Caddy images on GitHub-hosted `ubuntu-24.04` AMD64 runners. It runs no unit, integration or browser test suite. It publishes twelve images to GHCR and records immutable digests in the `release-candidate` artifact. The build argument for the gateway selects the correct public origin. These are newly compiled images of the CI-checked source, not a reuse of CI's image binaries.

Only the deployment job joins Tailscale, using an ephemeral OIDC identity. It validates the Coolify project/environment/application and edge domain, sets the exact source commit and image digests, disables automatic deployment, starts rollout, polls its deployment UUID and checks public HTTPS setup status. Both environments share a concurrency group so rollouts do not overlap. Cancellation or a timeout does not undo an already submitted Coolify deployment; inspect its queue before retrying.

## One-time Coolify application setup

The Ubuntu host is `coolify`, running **AMD64**, with 8 vCPUs, 16 GB RAM and 320 GB storage. Keep existing tailnet permissions. Only TCP 80 and 443 are public; dashboard/API and ordinary SSH use Tailscale. See the [server guide](coolify-server-setup.md).

1. In one Coolify project, create environments named exactly `test` and `prod` and a separate Git-based **Docker Compose** application in each. Point each at `https://github.com/julianhoelz94/Verfassung`, branch `main`, Compose path `/docker-compose.coolify.yml`. A public repository does not need a source deploy key.
2. Disable automatic deployments, preview deployments and incoming deployment webhooks. Do not enable raw Compose mode or preserve the source checkout. Do not select the development `docker-compose.yml`.
3. Load the Compose definition. Assign the environment's HTTPS domain **only to `edge-proxy` on internal port 80**, following [HTTPS with Let's Encrypt](#https-with-lets-encrypt). Leave domains on other services empty. Coolify owns TLS and routes to Caddy; Caddy retains API authorization and routing.
4. Create the persistent application environment values listed below. Use separate passwords, encryption keys and credentials in test and production. CD supplies the `ATLAS_IMAGE_*`, public-origin and transport values when a release is selected. Before the first run, ensure both applications have distinct UUIDs and belong to the intended environments.
5. Ensure Coolify's host management user can pull the GHCR images. New packages can be private even when their source repository is public. For private packages, use a classic PAT with `read:packages` for the host's registry login as described in server-guide step 10. CD publishes with its job's `GITHUB_TOKEN`; no publish PAT is needed.

Required persistent Coolify application values:

| Name | Purpose |
| --- | --- |
| `POSTGRES_PASSWORD` | Strong database password, kept stable across deployments |
| `IDENTITY_MFA_ENCRYPTION_KEY` | Stable 32-byte Base64 encryption key for persisted MFA credentials; generate using `openssl rand -base64 32` |
| `PROD_ADMIN_EMAIL`, `PROD_ADMIN_PASSWORD` | First administrator, with a unique password of at least 12 characters; both environments use these exact names |
| `TLS_TRUSTED_PROXIES` | Actual Coolify proxy address/CIDRs that Caddy may trust; inspect the proxy's Docker network |
| `PUBLIC_BASE_URL` | The environment's HTTPS origin from the table above |

The runtime definition preserves the canonical services' other configuration, including SMTP and internal service credentials. Configure those in Coolify when used. Complete site setup in the browser after the first deployment, including administrator security and real site settings. Demo account seeding stays off and API docs stay closed. Fixture accounts for optional prepopulate are created separately; deployment does not create them.

Store the bootstrap administrator credentials as runtime environment values in the Coolify application. They are not required in GitHub for an ordinary deployment. Changing `PROD_ADMIN_PASSWORD` after initial account creation does not reset the persisted user's password; change it through the site's account/recovery flow. The Coolify dashboard's own login password is separate and never needed by CD.

`docker-compose.coolify.yml` contains only image references and internal networking, with no host port publications or checkout bind mounts. Each database retains its named volume in the Coolify application's Compose project. No `backup-service` or backup image runs on this host: backup is provided at host level. CD does not create a pre-deployment backup, restore data or reverse migrations. Host backup and restore consistency are operator responsibilities.

Keep runtime wiring in `docker-compose.yml`, then regenerate the deployment file with:

```bash
python3 -m venv /tmp/atlas-cd-tools
/tmp/atlas-cd-tools/bin/python -m pip install PyYAML==6.0.2
/tmp/atlas-cd-tools/bin/python scripts/cd/render_compose.py
```

Normal CI checks this generated file for drift.

## HTTPS with Let's Encrypt

Configure this before the first manual deployment; verify the issued certificates after that deployment. The public TLS endpoint is Coolify's integrated **Traefik** proxy on `coolify`. It obtains and renews Let's Encrypt certificates. The application Caddy container receives internal HTTP using `TLS_MODE=external-proxy`. This setup needs no Certbot installation, certificate upload, DNS API token or extra GitHub SSL secret. [Coolify proxy overview](https://coolify.io/docs/core/networking/proxy/traefik/overview)

### 1. Point both public domains at the server

Create these DNS records at your DNS provider:

| Type | Hostname | Value |
| --- | --- | --- |
| A | `tst.verfassungen.julianhoelz.de` | Server's public IPv4 address |
| A | `verfassungen.julianhoelz.de` | The same public IPv4 address |

Use public addresses here. Add AAAA records only when IPv6 routes to this same proxy and the IPv6 firewall permits the same traffic. If using Cloudflare, set these records to **DNS only** for this direct HTTP-01 setup. Wait for DNS propagation before attempting issuance. [Coolify certificate troubleshooting](https://coolify.io/docs/troubleshoot/dns-and-domains/lets-encrypt-not-working)

From your workstation, check the answers:

```bash
for domain in tst.verfassungen.julianhoelz.de verfassungen.julianhoelz.de; do
  dig +short "$domain" A
  dig +short "$domain" AAAA
done
```

### 2. Keep the default ACME proxy configuration

Open **Servers → coolify → Proxy → Configuration**. Confirm the selected proxy is **Traefik** and it is running. Its default `letsencrypt` resolver uses the HTTP-01 challenge; the existing configuration should include these flags:

```text
--certificatesresolvers.letsencrypt.acme.httpchallenge=true
--certificatesresolvers.letsencrypt.acme.httpchallenge.entrypoint=http
--certificatesresolvers.letsencrypt.acme.storage=/traefik/acme.json
```

Keep the generated configuration; no custom resolver is needed. Coolify manages its public HTTP/HTTPS listeners. [Traefik configuration](https://coolify.io/docs/core/networking/proxy/traefik/overview)

Allow inbound **TCP 80 and 443** through the provider firewall and any host firewall, on each advertised IP version. Port 80 must remain reachable for issuance and future HTTP-01 renewal, including `/.well-known/acme-challenge/`. Let Coolify's proxy handle that route. Keep SSH and Coolify management ports private through Tailscale. [Let's Encrypt HTTP-01](https://letsencrypt.org/docs/challenge-types/#http-01-challenge)

### 3. Configure each application's HTTPS route

For each application's **Domains → Add domain** form, use:

| Application environment | Protocol | Domain | Port | Service | Path |
| --- | --- | --- | --- | --- | --- |
| `test` | `https` | `tst.verfassungen.julianhoelz.de` | `80` | `edge-proxy` | empty |
| `prod` | `https` | `verfassungen.julianhoelz.de` | `80` | `edge-proxy` | empty |

Save each route. If your Coolify version uses one URL field, the equivalent values are `https://tst.verfassungen.julianhoelz.de:80` and `https://verfassungen.julianhoelz.de:80`. Here `80` selects the **container target port**; browsers use the normal HTTPS URL on public port **443**, without `:80`. Keep `PUBLIC_BASE_URL` in Coolify and GitHub at the canonical HTTPS origin without `:80`. [Coolify domain and target-port settings](https://coolify.io/docs/core/networking/domains#route-to-a-port-or-path)

Keep labels managed by Coolify, the default `letsencrypt` certificate resolver and the HTTP-to-HTTPS redirect. Leave all other services' domain fields empty and keep `TLS_TRUSTED_PROXIES` set to the actual Coolify proxy network. The runtime Compose file supplies `TLS_MODE=external-proxy` and secure cookies. The private Coolify dashboard/API retains its Tailscale URL.

Save the settings, then trigger **GitHub → Actions → Deploy → Run workflow** for the chosen environment. That manual rollout activates the route and certificate request. Configure the second environment in the same way; it receives a certificate covering its own hostname.

### 4. Verify after deployment

Open each deployed HTTPS URL in a browser and inspect its certificate: it must cover the requested hostname, chain to a trusted issuer and be within its validity period. From a workstation, run these checks for each environment you have deployed:

```bash
domain=tst.verfassungen.julianhoelz.de
# For production instead: domain=verfassungen.julianhoelz.de
curl --connect-timeout 10 --max-time 30 --fail --silent --show-error \
  "https://$domain/api/identity/setup/status"
curl --connect-timeout 10 --max-time 30 --silent --show-error \
  --dump-header - --output /dev/null "http://$domain/"
openssl s_client -connect "$domain:443" -servername "$domain" </dev/null 2>/dev/null \
  | openssl x509 -noout -subject -issuer -dates
```

The HTTPS request must succeed with normal certificate verification; do not use `curl -k`. The HTTP response must redirect to the same hostname using `https://`. The OpenSSL command displays the certificate for inspection. CD also checks HTTPS setup status after Coolify reports a successful deployment.

### 5. Renewal and troubleshooting

Coolify's proxy renews certificates automatically; no GitHub schedule or renewal secret is needed. Keep DNS, public port 80 and proxy ACME storage available between deployments. Include `/data/coolify/proxy/` in your existing host backup so its ACME account/certificate state survives recovery. Inspect certificates under **Servers → coolify → Proxy → TLS Certificates**. [Coolify HTTPS and renewal](https://coolify.io/docs/core/networking/domains#configure-https-and-redirects), [certificate storage](https://coolify.io/docs/core/networking/proxy/traefik/tls-certificates)

If a browser shows a self-signed/default certificate or issuance fails, inspect **Servers → coolify → Proxy → Logs** for ACME errors. Check the public A/AAAA answers, port 80 reachability, domain/service/target-port settings and any CDN proxy first. Resolve validation errors before retrying to avoid repeated issuance attempts and rate limits. ACME storage is shared by both environments; preserve it during troubleshooting. These instructions do not establish that a certificate has already been issued. [Coolify Let's Encrypt troubleshooting](https://coolify.io/docs/troubleshoot/dns-and-domains/lets-encrypt-not-working)

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
