<!-- Generated from docs/manual-deployment.md by scripts/sync-deployment-wiki.py.
Edit the source guide and run: python3 scripts/sync-deployment-wiki.py -->

# Manual deployment through GitHub Actions

The workflow is [`.github/workflows/deploy.yml`](https://github.com/julianhoelz94/Verfassung/blob/main/.github/workflows/deploy.yml). It has only a manual trigger. Preparing these files does not deploy anything. The first remote rollout and server restore remain to be verified.

## Run a deployment

After this change is merged into `main`, open **GitHub → Actions → Deploy → Run workflow** as a repository administrator. Under **Use workflow from**, select the published release tag, for example `v.1.1`, then choose the environment below. Both the workflow and application source come from that tag. Branches, including `main`, cannot deploy.

| Input | Default | Effect |
| --- | --- | --- |
| `environment` | `test` | Selects the GitHub environment, its credentials, Coolify application and public domain |
| `prepopulate` | `false` | Runs the existing `npm run prepopulate` after rollout, uploading, reviewing, publishing and reading back generated fixture content |
| `prepopulate_profile` | `compact` | Chooses `compact`, `extended` or `scale` when prepopulate is enabled |

GitHub loads the workflow stored in the selected tag. Use a new published release whose commit includes the fixture profile selector; merging this change into `main` does not update an older tag's workflow or fixture script. Do not move or recreate an existing published tag automatically. Publishing a release alone does not trigger deployment.

| Environment | Public origin |
| --- | --- |
| `test` | `https://tst.verfassungen.julianhoelz.de` |
| `prod` | `https://verfassungen.julianhoelz.de` |

CD derives the release name from `GITHUB_REF`, requires a published GitHub release and resolves lightweight or annotated tags to a commit. That commit must equal the dispatched `GITHUB_SHA`; a tag moved after dispatch is rejected. Every workflow/source checkout, CI check, image build, artifact and Coolify deployment uses that same SHA. CD checks the existing push-to-main CI run for the **release commit**, even when `main` has moved ahead. CD waits up to **45 minutes**, checking every **30 seconds**, for CI to appear and for the service-discovery prerequisite `backend-services`, `frontend`, `mcp-server`, `gateway-image`, `full-stack-service-artifacts`, and every `images (<service>)` job to succeed. Queued, running or not-yet-created compilation jobs keep CD waiting. Each job's newest attempt must succeed; a failed, cancelled, skipped or timed-out job in the current compilation attempt stops CD immediately. During a rerun, an older failure can wait for its replacement job to appear. A completed CI run with missing required jobs, or expiry of the wait limit, also stops CD with a clear error. Rerunning service discovery also requires fresh image-matrix results from that attempt. A partial rerun of unrelated jobs retains the earlier successful compilation results for this same commit. CD does not wait for or rerun E2E jobs and does not require their result. These existing jobs include their usual CI checks; CD does not change the normal CI suite.

CD discovers twelve image packages and builds them in a matrix with **up to six GitHub-hosted `ubuntu-24.04` AMD64 runners at once**. Each runner builds one image. Kotlin runners compile their service JAR using `bootJar -x test`; the other runners build the gateway, MCP and Caddy images directly. CD runs no unit, integration or browser test suite. The gateway build argument selects the correct public origin. These are newly compiled images of the CI-checked source, not a reuse of CI's image binaries.

Each build publishes its image to GHCR and uploads an artifact containing the immutable digest. Only after every image job succeeds does CD assemble `release-candidate`. Assembly requires exactly the expected twelve images, all matching the repository, source SHA, selected environment, AMD64 architecture and workflow run. A failed build or a missing, duplicate or mismatched artifact prevents deployment.

The manifest also records the authorized release tag as `release_tag`. CD passes that tag to the gateway as the runtime variable `DEPLOYED_TAG`, which the About page displays as the deployed version. Selecting an older release restores its tag with its images. Legacy manifests without a tag clear the value and display an unavailable version. For a standalone or local Compose deployment, set `DEPLOYED_TAG` to the release being run; leave it empty for an untagged development build. The value is read at runtime, so it does not require rebuilding the gateway image.

Use **Re-run failed jobs** to retry an image failure within the same workflow run: successful image artifacts remain available, and rebuilt images replace their own artifacts. The collector accepts different build attempts only within that same run and exact source/environment. A new manual dispatch builds all twelve images again. Image artifacts expire after 30 days; if required artifacts have expired, start a new dispatch.

Only the deployment job joins Tailscale, using an ephemeral OIDC identity. It validates the Coolify project/environment/server and required shared variables, creates or reuses the environment's application, configures its edge domain and exact source/image digests, disables automatic deployment, starts rollout, polls its deployment UUID and checks public HTTPS setup status. Both environments share a concurrency group so rollouts do not overlap. Cancellation or a timeout does not undo an already submitted Coolify deployment; inspect its queue before retrying.

## One-time setup: three steps

The Ubuntu host is `coolify`, running **AMD64**, with 8 vCPUs, 16 GB RAM and 320 GB storage. Keep existing tailnet permissions. Only TCP 80 and 443 are public; dashboard/API and ordinary SSH use Tailscale. See the [server guide](Coolify-Server-Setup).

1. **Prepare Coolify.** Keep project **Constitution Atlas** with environments named exactly `test` and `prod`, the running Traefik proxy and public DNS. Under **Shared Variables → Environment wide**, choose the project's `test` environment and save the five values below. Repeat with separate secrets for `prod` before its first deployment. Ensure the host management user can pull the GHCR packages; private packages need the registry login described in [server-guide step 10](Coolify-Server-Setup#10-prepare-image-pulls-if-ghcr-images-are-private).
2. **Prepare GitHub.** Add the [environment variables and secrets](#github-environments-and-tailscale-identity) to GitHub environments `test` and `prod`. Copy the project and server UUIDs from Coolify. No application UUID or manually created application is required.
3. **Deploy a published release manually.** Open **Actions → Deploy → Run workflow**, select the published release tag under **Use workflow from**, select `test`, and leave `prepopulate` unchecked. CD waits for the release commit's CI compilation to pass, then creates `constitution-atlas-test`, connects the shared values, sets `https://tst.verfassungen.julianhoelz.de:80` on `edge-proxy`, and deploys. Open the public HTTPS site and complete first-run setup. Use `prod` later for `constitution-atlas-prod` and its production domain.

Required **Coolify environment-wide shared variables**:

| Name | Example or generation command | Purpose |
| --- | --- | --- |
| `POSTGRES_PASSWORD` | `openssl rand -hex 32` | Strong database password; keep stable across deployments |
| `AUDIT_RUNTIME_PASSWORD` | `openssl rand -hex 32` | Separate restricted Audit runtime identity; Flyway uses the database owner. Add this shared variable before deploying this revision. |
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

The runtime definition preserves the canonical services' other configuration, including optional SMTP settings. CD provisions the internal Ingestion, Editor and Identity audit credentials automatically; do not configure their tokens manually on the application. Complete site setup in the browser after the first deployment, including administrator security and real site settings. Demo account seeding stays off. Public API documentation is enabled by default and can be changed in **Admin → Site settings → API documentation → Allow public Swagger UI access**. When enabled, all nine Swagger UI pages are public after setup, with links on About; their assets and OpenAPI schemas remain accessible when anonymous constitution browsing is disabled. Disabling the setting hides those links and blocks Swagger routes for everyone. Interactive API calls retain their normal authentication, authorization and browsing policy. CD enables the infrastructure switch `CADDY_EXPOSE_API_DOCS` so the admin setting controls access; standalone Compose deployments also default to enabled and may explicitly set the switch to `false` as a hard limit that closes documentation routes. Optional prepopulate uses an existing site administrator; deployment does not create additional fixture accounts.

Bootstrap administrator credentials belong in Coolify; they are not required in GitHub for an ordinary deployment. Changing `PROD_ADMIN_PASSWORD` after initial account creation does not reset the persisted user's password; change it through the site's account/recovery flow. The Coolify dashboard's own login password is separate and never needed by CD.

`docker-compose.coolify.yml` contains only image references and internal networking, with no host port publications or checkout bind mounts. Each database retains its named volume in the Coolify application's Compose project. No `backup-service` or backup image runs on this host: backup is provided at host level. CD does not create a pre-deployment backup, restore data or reverse migrations. Host backup and restore consistency are operator responsibilities.

The manual deployment workflow generates three independent internal ingestion credentials for each deployment and supplies the same values to Identity and Ingestion. With demo seeding still disabled, Identity registers only `ingestion:publish`, `audit:append` and `search:reindex`, each on its own deployment-managed token. Values are not written to the release manifest or logs. A later deployment rotates these credentials; the same configured values remain valid across a container restart and renew their 90-day lifetime. Deploy at least every 90 days or renew the managed credentials before expiry. Do not replace these entries with an account MCP key or a general automation token. A standalone production deployment must supply three distinct random URL-safe secrets (at least 43 characters) as `INGESTION_PUBLISH_TOKEN`, `INGESTION_AUDIT_TOKEN`, and `INGESTION_SEARCH_TOKEN`, and enable `INGESTION_MANAGED_CREDENTIALS=true` on Identity.

The same workflow generates a separate `EDITOR_SERVICE_TOKEN` for Identity and Editor and enables `EDITOR_MANAGED_CREDENTIALS` on Identity. It grants only `catalog:write`, `catalog:publish`, `content:write`, `amendment:write`, `amendment:publish`, `audit:append` and `search:reindex`, with no human roles or administrator access. This supports Editor publication, audit delivery and outbox retries without retaining the prepopulate administrator's session. It follows the same rotation and expiry rules as the ingestion credentials and is provisioned even when prepopulate is off. A standalone production deployment can enable `EDITOR_MANAGED_CREDENTIALS=true` on Identity and supply the same independent random URL-safe `EDITOR_SERVICE_TOKEN` to Identity and Editor.

CD also generates an independent `IDENTITY_AUDIT_TOKEN`, passes it to Identity as `AUDIT_API_BEARER` and enables `IDENTITY_MANAGED_AUDIT_CREDENTIAL`. It grants only `audit:append`, so login/setup audit delivery does not rely on a human session or Editor credential. Standalone installations can enable `IDENTITY_MANAGED_AUDIT_CREDENTIAL=true` and supply their own independent `AUDIT_API_BEARER`. The same rotation and expiry rules apply.

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

Keep labels managed by Coolify, the default `letsencrypt` certificate resolver and the HTTP-to-HTTPS redirect. CD checks that **Container Labels Readonly** is enabled, as it is by default. For compatibility with released Coolify APIs, it verifies that setting rather than writing an unsupported API field, and uses the server's default Let's Encrypt resolver instead of a per-application resolver override. If label management has been disabled on an existing application, restore the default before deploying. An existing per-application certificate resolver must be empty/default or `letsencrypt`; CD rejects other overrides.

Leave all other services' domain fields empty and keep `TLS_TRUSTED_PROXIES` set to the actual Docker address pools or maintained proxy peer CIDRs. The runtime Compose file supplies `TLS_MODE=external-proxy` and secure cookies. The private Coolify dashboard/API retains its Tailscale URL.

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

Create GitHub environments **test** and **prod**. Under **Deployment branches and tags**, allow the intended release tags (for this repository, a selected **Tag** rule such as `v*`) and remove branch deployment rules. The workflow independently rejects every branch and every tag without a published GitHub release. Use required reviewers if desired. The workflow also checks that both the initial actor and the rerunning actor are repository administrators.

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

One Tailscale trust credential can cover both environments with subject `repo:julianhoelz94@26120868/Verfassung@1341839964:environment:*`. Retain claim restrictions for repository `julianhoelz94/Verfassung`, ref `refs/tags/v*` and workflow_ref `julianhoelz94/Verfassung/.github/workflows/deploy.yml@refs/tags/v*`. Replace any earlier main-only claim rules before running from a release tag; otherwise the OIDC token exchange is rejected. Allow authentication-key write access for `tag:github-deploy`. No reusable Tailscale auth key, OAuth secret or custom tailnet access rules are added. [Tailscale action OIDC inputs](https://tailscale.com/docs/integrations/github/github-action)

## Optional npm prepopulate

The deployment's `prepopulate` checkbox runs the release's fixture script after a successful Coolify rollout. It imports, reviews, publishes and reads back **generated sample constitutional content**, then rebuilds and checks the search index. It also runs `--verify-only` afterward. The option defaults off and does not run E2E tests. Choosing `prod` publishes the selected sample content on the production site.

| Fixture profile | Content | Accounts |
| --- | --- | --- |
| `compact` (deployment default) | Original XA/XB/XC set: three fictional countries, three constitutions, seven versions, 66 top-level snapshots and three amendments | Existing administrator |
| `extended` | Compact plus 22 exploration scenarios: non-standard layouts, saved drafts and review queues, source corrections, staged imports, amendment evidence, document revisions, Wiki drafts, historical jurisdictions, lifecycle events, comparisons and multilingual search | Existing administrator |
| `scale` | Extended plus 225-provision snapshots for pagination and search checks | Existing administrator |

For exploring the growing toolset on the test site, select **test + prepopulate + extended**. The non-standard examples include mixed roots, skipped hierarchy levels, untitled and unnumbered units, interleaved parent text, literal labels, spanning tables and shared footnotes.

Complete the following setup once for each site where you want to use it. A normal deployment with the checkbox clear needs none of the `PREPOPULATE_*` secrets.

### 1. Deploy the site and finish its setup

1. Run **Actions → Deploy → Run workflow**, select the published release tag under **Use workflow from** and choose the intended environment, and leave the prepopulate checkbox clear. If the site is already deployed, continue with its setup instead.
2. Open the corresponding website: [test](https://tst.verfassungen.julianhoelz.de) or [production](https://verfassungen.julianhoelz.de). Sign in with the initial administrator email and password configured through `PROD_ADMIN_EMAIL` and `PROD_ADMIN_PASSWORD` in that Coolify environment. Those variable names also apply to the test installation.
3. Finish authenticator enrollment and the site setup wizard, including the required settings and legal-page publications. Finish the final review so that setup is marked complete. See the [administrator guide](https://github.com/julianhoelz94/Verfassung/wiki/Admin-Guide#first-installation) for the wizard. **Configure email later** is supported; prepopulate does not require outgoing mail.

Prepopulate does not complete this wizard or create its own login accounts. If setup is unfinished, its post-deployment step stops with `Complete the site setup wizard before running prepopulate.`

### 2. Use your existing administrator and authenticator

Use the existing active `admin` account initialized through Coolify for every deployment profile. No editor, reviewer, publisher or viewer account needs to be created for CD prepopulation. The administrator performs import preparation, review approval and publication through the normal APIs as separate steps. CD also checks that anonymous requests cannot read private editorial work. Local/CI fixtures retain separate role accounts for their permission checks.

The script signs in with the administrator's current password and generates a TOTP code from its authenticator setup key. It cannot complete a passkey/WebAuthn prompt or enroll MFA. Record the **manual Base32 setup key** during authenticator enrollment, under **Can't scan the QR code?** — **QR-Code lässt sich nicht scannen?** in German. The website only displays this key during enrollment. Use that key, not a six-digit code, recovery code, QR image or complete `otpauth://` URL. Confirm that the account can sign in using its password and authenticator code.

### 3. Add the credentials to the matching GitHub environment

In the repository, open **Settings → Environments → test** (or **prod**), then under **Environment secrets** choose **Add secret** for each row below. Enter the name exactly and paste only the value, without quotation marks. These are secrets within the existing environment, not environment variables or new environments. [GitHub's environment-secret instructions](https://docs.github.com/en/actions/how-tos/write-workflows/choose-what-workflows-do/use-secrets#creating-secrets-for-an-environment)

| Environment secret | Value |
| --- | --- |
| `PREPOPULATE_ADMIN_EMAIL` | Your existing administrator's email |
| `PREPOPULATE_ADMIN_PASSWORD` | That account's current password |
| `PREPOPULATE_TOTP_SECRET` | That administrator's manual authenticator setup key; this name intentionally has no `ADMIN` segment |

Store the credentials of the **test website** in GitHub's `test` environment, and those of the **production website** in `prod`. Each site has its own account and enrollment key. GitHub Actions runs the uploader, so Coolify shared variables alone do not supply these credentials. Changing Coolify's bootstrap password does not reset an existing site's persisted account password.

Only the three administrator secrets above are required for prepopulate. CD generates and configures the backend service credentials automatically; no additional Coolify variables, service-token secrets or GitHub access tokens are required. Prepopulate confirms that the signed-in account has the administrator role before writing fixture data. CD supplies `PREPOPULATE_BASE_URL` and `PREPOPULATE_DEPLOYMENT_ENVIRONMENT` from the environment selection, so do not configure them yourself or set the local-only `PREPOPULATE_TEST_STACK` flag.

### 4. Run the deployment with prepopulate enabled

1. Open **Actions → Deploy → Run workflow** as a repository administrator. Select the published release tag under **Use workflow from** and select the environment whose administrator secrets you just prepared.
2. Select **Upload and publish generated fixture content after deployment (requires completed site setup and admin credentials)**, then set **Fixture set to upload when prepopulate is enabled** to `compact`, `extended` or `scale`. Choose **Run workflow**. This opt-in applies only to this run; later runs still default to leaving it off and using compact.
3. Complete any required environment approval. CD waits for successful CI compilation checks for the selected source, compiles/publishes its images, deploys through Coolify and checks the public HTTPS endpoint. Then it runs **Prepopulate the selected environment after successful deployment** using the same source checkout.
4. Open that step's log. For compact, the upload and subsequent read-only verification finish with:

   ```text
   Prepopulation compact baseline uploaded and verified: {"countries":3,"constitutions":3,"versions":7,"articles":66,"amendments":3}
   Prepopulation compact baseline verified: {"countries":3,"constitutions":3,"versions":7,"articles":66,"amendments":3}
   ```

The baseline count describes these fixtures, not every record on the site. Extended also reports `Verified 22 exploration scenarios`; scale reports 23 and checks the 225-provision snapshots across all pages. The script needs only Node 22/npm on the runner and does not install browser dependencies or run `npm install`.

5. In the workflow run's **Artifacts**, download `prepopulate-guide-test` (or `prepopulate-guide-prod`) and open `scenario-guide.md`. It contains the selected site's direct links, required roles, actions and expected outcomes. The adjacent JSON files hold resolved IDs. Credentials are not written into these files.

### 5. Verify the site and handle a retry

Open the selected website and look for **Atlas Testland**, **Atlas Sample Republic** and **Atlas Structure Republic** in the country list. Open a constitution and its versions, follow an article, and search for `dignity`. Reload the page to check the published content. If anonymous browsing is disabled, sign in first.

Matching fixtures are reusable: a later run verifies existing versions and amendments, resumes matching unfinished import jobs, and rebuilds the search index. Completed exploration scenarios preserve later manual work. A failed run may already have published some content; it does not roll back those writes or the completed deployment. Correct the cause, then start another manual deployment with prepopulate and the same profile selected. This also performs a deployment; the workflow has no separate prepopulate-only input.

For extended and scale, the workflow restores the latest `prepopulate-state-test` or `prepopulate-state-prod` journal from a previous release-tag Deploy run, including a failed attempt. It saves the updated journal even when fixture upload fails. State is kept separately per environment and matched to the origin and administrator identity; it contains IDs and fingerprints, not account credentials. Other workflows and unpublished source revisions are not accepted as deployment checkpoints. Cross-run artifact access uses the workflow's built-in token with `actions: read`. [GitHub artifact downloads](https://github.com/actions/download-artifact/tree/v4#download-artifacts-from-other-workflow-runs-or-repositories)

The state artifact requests **90-day retention**. Download the latest journal and keep it with the target's private backups before it expires. Extended/scale stop if exploration fixtures already exist but their matching journal is missing, rather than recreating pending setup proposals. If the artifact is no longer available, restore the saved journal into `apps/gateway-web/e2e/fixtures/generated/.runtime/` in a checkout of the deployed release and run the script from that checkout with the same account/environment credentials:

```sh
cd apps/gateway-web
PREPOPULATE_DEPLOYMENT_ENVIRONMENT=test \
PREPOPULATE_BASE_URL=https://tst.verfassungen.julianhoelz.de \
PREPOPULATE_PROFILE=extended npm run prepopulate
```

Load the `PREPOPULATE_*` account secrets from your password manager into the shell environment first. Use the production origin and `prod` environment only when targeting production. Keep the runtime directory for later manual runs; do not set the local-only `PREPOPULATE_TEST_STACK` flag for either deployed site.

| Symptom in the workflow | What to check |
| --- | --- |
| `Missing environment secrets: PREPOPULATE_…` in **Require deployment settings** | Add the named administrator credential or authenticator secret to the selected GitHub environment. This check stops before the Coolify rollout. |
| `Complete the site setup wizard…` | Finish the selected site's setup, then retry. |
| `Set the prepopulate admin TOTP secret` | Add the administrator's manual setup key as `PREPOPULATE_TOTP_SECRET`. |
| `Restore its saved fixture journal` or an expired checkpoint | Recover the latest state artifact/private backup for the same origin and administrator. Do not create replacement proposals by deleting the journal. |
| `proposal creation was interrupted before its ID was recorded` | Inspect the existing proposal/audit record and recover its ID in the journal before retrying; the script deliberately does not submit creation twice. |
| `Invalid TOTP secret`, an MFA verification error, or `login returned no session token` | Check for a copied six-digit code/URL instead of the key, an unfinished enrollment, a passkey-only account, or a key belonging to another account/site. Verify password-and-authenticator login in the browser; check the server clock if correct codes are rejected. |
| Login fails, or import/review/publication returns an authorization error | Check the account is active, its stored password is current, and it has the `admin` role. Do not substitute invitation tokens for passwords. |
| An import remains incomplete, or a content/outline assertion reports a mismatch | Inspect the named import in **Admin → Import** and the step log. Existing fixture content differs from what this source expects, or a service operation failed. Resolve the specific mismatch/failure before retrying; repeated runs are not a general data repair or database reset. |
| Deployment step succeeded but the prepopulate step failed | The application rollout remains in place. Check the failing post-deployment step and any content already published rather than treating the whole site as rolled back. |

All three administrator secrets are checked for presence before deployment; account validity, setup completion and MFA are checked by the optional script afterward. Keep passwords and setup keys in secrets/password storage, not in screenshots or copied diagnostic logs.

## Release recovery and first-rollout evidence

The `release-candidate` artifact contains `manifest.json` and an image override for inspection. Record the selected release tag, its resolved source SHA, digests, Coolify deployment UUID, domain and outcome. Keep any release needed for rollback beyond the artifact's 30-day retention. Coolify may retain earlier releases, but choosing earlier images does not roll back databases or schema migrations. Use your host backup recovery procedure when state recovery is required.

For the first rollout, verify TLS, all services' health in Coolify, setup completion, authentication and persisted content across a second manual deployment. E2E remains in normal CI, outside CD. Public launch also retains the real legal-details gate tracked in [VER-269](https://linear.app/verfassung/issue/VER-269/publish-verified-legal-details-and-check-german-hosting-before-public). The production procedure remains unverified until these operator checks are exercised on the host.
