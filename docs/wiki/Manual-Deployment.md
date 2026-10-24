<!-- Generated from docs/manual-deployment.md by scripts/sync-deployment-wiki.py.
Edit the source guide and run: python3 scripts/sync-deployment-wiki.py -->

# Manual deployment through GitHub Actions

The workflow is [`.github/workflows/deploy.yml`](https://github.com/julianhoelz94/Verfassung/blob/main/.github/workflows/deploy.yml). It has only a manual trigger. Preparing these files does not deploy anything. The first remote rollout and server restore remain to be verified.

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

The source is the fixed `GITHUB_SHA` of the selected `main` dispatch. CD checks the existing push-to-main CI run for that exact commit. CD waits up to **45 minutes**, checking every **30 seconds**, for CI to appear and for the service-discovery prerequisite `backend-services`, `frontend`, `mcp-server`, `gateway-image`, `full-stack-service-artifacts`, and every `images (<service>)` job to succeed. Queued, running or not-yet-created compilation jobs keep CD waiting. Each job's newest attempt must succeed; a failed, cancelled, skipped or timed-out job in the current compilation attempt stops CD immediately. During a rerun, an older failure can wait for its replacement job to appear. A completed CI run with missing required jobs, or expiry of the wait limit, also stops CD with a clear error. Rerunning service discovery also requires fresh image-matrix results from that attempt. A partial rerun of unrelated jobs retains the earlier successful compilation results for this same commit. CD does not wait for or rerun E2E jobs and does not require their result. These existing jobs include their usual CI checks; CD does not change the normal CI suite.

CD compiles the service JARs using `bootJar -x test` and builds the gateway, MCP and Caddy images on GitHub-hosted `ubuntu-24.04` AMD64 runners. It runs no unit, integration or browser test suite. It publishes twelve images to GHCR and records immutable digests in the `release-candidate` artifact. The build argument for the gateway selects the correct public origin. These are newly compiled images of the CI-checked source, not a reuse of CI's image binaries.

Only the deployment job joins Tailscale, using an ephemeral OIDC identity. It validates the Coolify project/environment/server and required shared variables, creates or reuses the environment's application, configures its edge domain and exact source/image digests, disables automatic deployment, starts rollout, polls its deployment UUID and checks public HTTPS setup status. Both environments share a concurrency group so rollouts do not overlap. Cancellation or a timeout does not undo an already submitted Coolify deployment; inspect its queue before retrying.

## One-time setup: three steps

The Ubuntu host is `coolify`, running **AMD64**, with 8 vCPUs, 16 GB RAM and 320 GB storage. Keep existing tailnet permissions. Only TCP 80 and 443 are public; dashboard/API and ordinary SSH use Tailscale. See the [server guide](Coolify-Server-Setup).

1. **Prepare Coolify.** Keep project **Constitution Atlas** with environments named exactly `test` and `prod`, the running Traefik proxy and public DNS. Under **Shared Variables → Environment wide**, choose the project's `test` environment and save the five values below. Repeat with separate secrets for `prod` before its first deployment. Ensure the host management user can pull the GHCR packages; private packages need the registry login described in [server-guide step 10](Coolify-Server-Setup#10-prepare-image-pulls-if-ghcr-images-are-private).
2. **Prepare GitHub.** Add the [environment variables and secrets](#github-environments-and-tailscale-identity) to GitHub environments `test` and `prod`. Copy the project and server UUIDs from Coolify. No application UUID or manually created application is required.
3. **Deploy manually from main.** Open **Actions → Deploy → Run workflow**, select `main`, `test`, and leave `prepopulate` unchecked. CD waits for the selected commit's CI compilation to pass, then creates `constitution-atlas-test`, connects the shared values, sets `https://tst.verfassungen.julianhoelz.de:80` on `edge-proxy`, and deploys. Open the public HTTPS site and complete first-run setup. Use `prod` later for `constitution-atlas-prod` and its production domain.

Required **Coolify environment-wide shared variables**:

| Name | Example or generation command | Purpose |
| --- | --- | --- |
| `POSTGRES_PASSWORD` | `openssl rand -hex 32` | Strong database password; keep stable across deployments |
| `IDENTITY_MFA_ENCRYPTION_KEY` | `openssl rand -base64 32` | Stable 32-byte Base64 key for persisted MFA credentials |
| `PROD_ADMIN_EMAIL` | Your real administrator email address | First administrator; both environments use this exact name |
| `PROD_ADMIN_PASSWORD` | Run `openssl rand -hex 32` again | Separate administrator password, at least 12 characters |
| `TLS_TRUSTED_PROXIES` | Actual Docker address pools, separated by spaces | Trusted internal forwarding peers, including the application network Coolify creates later |

Run generation commands locally and save their outputs directly in Coolify. Do not commit generated values. Use different database/admin passwords and encryption keys in test and production. Inspect the host's actual Docker address pools over private SSH:

```bash
sudo docker info --format '{{range .DefaultAddressPools}}{{.Base}} {{end}}'
```

Copy the reported CIDRs into `TLS_TRUSTED_PROXIES`. If Docker reports no pools, inspect its daemon network configuration before choosing a value. Do not use `0.0.0.0/0`. Trusting these pools includes other containers in them; this matches the dedicated host's internal trust model. Inspecting only the existing `coolify` network is insufficient: Coolify connects Traefik to a new per-application network when it deploys. No service in this application publishes a host port. You can narrow the trust later to the actual proxy peer networks if you maintain it when those networks change.

Defining a shared variable alone does not inject it into an application. CD adds references such as `{{environment.POSTGRES_PASSWORD}}` and marks the required Compose interpolation values available at both build time and runtime. Coolify parses Compose during its preparation/build phase even though these images have no source build directives. CD does not need sensitive-read permission to check the shared-variable names. [Coolify shared variables](https://coolify.io/docs/core/team/shared-variables)

The first run creates the application with instant deployment, auto-deployment and preview deployment disabled. Later runs reuse the same application and its named volumes. Discovery rejects ambiguous or incompatible resources instead of silently creating a second stack. For an application created using the earlier guide, the optional GitHub variable `COOLIFY_APP_UUID` explicitly selects it; CD still validates its project, environment, repository and server. When adopting an existing application, copy its existing persistent password/key values into the environment-wide shared variables; generating replacements would not rotate existing database credentials and would make stored MFA data unreadable. Remove custom Compose commands or deployment hooks before adoption; CD rejects those settings. Do not rename/delete the generated application casually, since its identity anchors persistent storage.

The runtime definition preserves the canonical services' other configuration, including SMTP and internal service credentials. Configure those on the application when used. Complete site setup in the browser after the first deployment, including administrator security and real site settings. Demo account seeding stays off and API docs stay closed. Fixture accounts for optional prepopulate are created separately; deployment does not create them.

Bootstrap administrator credentials belong in Coolify; they are not required in GitHub for an ordinary deployment. Changing `PROD_ADMIN_PASSWORD` after initial account creation does not reset the persisted user's password; change it through the site's account/recovery flow. The Coolify dashboard's own login password is separate and never needed by CD.

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

### 3. Let CD configure the application's HTTPS route

The first manual CD run creates/configures these routes automatically. No application or domain-form setup is required beforehand. To inspect the result afterward, open the generated application and its domain settings:

| Application environment | Protocol | Domain | Port | Service | Path |
| --- | --- | --- | --- | --- | --- |
| `test` | `https` | `tst.verfassungen.julianhoelz.de` | `80` | `edge-proxy` | empty |
| `prod` | `https` | `verfassungen.julianhoelz.de` | `80` | `edge-proxy` | empty |

The API route values are `https://tst.verfassungen.julianhoelz.de:80` and `https://verfassungen.julianhoelz.de:80`. Here `80` selects the **container target port**; browsers use the normal HTTPS URL on public port **443**, without `:80`. Keep `PUBLIC_BASE_URL` in Coolify and GitHub at the canonical HTTPS origin without `:80`. [Coolify domain and target-port settings](https://coolify.io/docs/core/networking/domains#route-to-a-port-or-path)

Keep labels managed by Coolify, the default `letsencrypt` certificate resolver and the HTTP-to-HTTPS redirect. Leave all other services' domain fields empty and keep `TLS_TRUSTED_PROXIES` set to the actual Docker address pools or maintained proxy peer CIDRs. The runtime Compose file supplies `TLS_MODE=external-proxy` and secure cookies. The private Coolify dashboard/API retains its Tailscale URL.

Trigger **GitHub → Actions → Deploy → Run workflow** for the chosen environment after its shared variables and GitHub configuration are ready. That manual rollout activates the route and certificate request. The other environment receives its own application and hostname when you first select it.

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
| `COOLIFY_URL` | `http://coolify:8000` with MagicDNS, or the actual Tailscale IP; no `/api/v1` path |
| `COOLIFY_PROJECT_UUID` | Project UUID from Coolify |
| `COOLIFY_SERVER_UUID` | Server UUID from **Servers → coolify**; same for both environments |
| `PUBLIC_BASE_URL` | Exact HTTPS origin for that environment |
| `TS_CLIENT_ID`, `TS_AUDIENCE` | Existing Tailscale federated identity identifiers |
| `TS_TAGS` | `tag:github-deploy` |

Open **Projects → Constitution Atlas** in Coolify and copy the identifier immediately after `/project/` in the browser URL for `COOLIFY_PROJECT_UUID`. Open **Servers → coolify** and copy the identifier after `/server/` for `COOLIFY_SERVER_UUID`. For example, `/server/abc123xyz` means the server UUID is `abc123xyz`. These are identifiers, not passwords or Tailscale addresses. Both GitHub environments use the same project/server UUIDs; their environment names isolate the applications.

Example GitHub environment variable values (replace the angle-bracket placeholders):

```dotenv
COOLIFY_URL=http://coolify:8000
COOLIFY_PROJECT_UUID=<copy-project-uuid>
COOLIFY_SERVER_UUID=<copy-server-uuid>
PUBLIC_BASE_URL=https://tst.verfassungen.julianhoelz.de
TS_CLIENT_ID=<copy-tailscale-client-id>
TS_AUDIENCE=<copy-tailscale-audience>
TS_TAGS=tag:github-deploy
```

For `prod`, change `PUBLIC_BASE_URL` to `https://verfassungen.julianhoelz.de`. The Tailscale identifiers can be shared if their trust credential covers both environments. `COOLIFY_APP_UUID` is optional only for adopting an existing application; leave it unset for automatic creation.

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
