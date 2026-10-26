<!-- Generated from docs/coolify-server-setup.md by scripts/sync-deployment-wiki.py.
Edit the source guide and run: python3 scripts/sync-deployment-wiki.py -->

# Set up coolify for manual GitHub CD over Tailscale

Updated: 24 October 2026.

This guide prepares a fresh Ubuntu server for the [CD plan](https://github.com/julianhoelz94/Verfassung/blob/main/docs/deployment-cd-plan.md). The server installation commands are for you to run; they have not been executed on your remote server. The manual CD workflow and runtime Compose definition are described in the [deployment runbook](Manual-Deployment); the first remote rollout remains unverified.

## Target configuration

| Setting | Value |
| --- | --- |
| Ubuntu hostname | `coolify` |
| Tailscale machine name | `coolify` |
| Server | 8 vCPUs, 16 GB RAM, 320 GB storage |
| Architecture | AMD64 (`x86_64`) |
| Operating system | Ubuntu Server 24.04 LTS |
| Test application | `https://tst.verfassungen.julianhoelz.de` |
| Production application | `https://verfassungen.julianhoelz.de` |
| Public inbound ports | TCP 80 and TCP 443 only, on IPv4 and IPv6 |
| Administration | Existing trusted Tailscale network |
| Tailnet permissions | Keep existing permissions; no custom ACLs or grants |
| Build and tests | Tests in normal CI; CD checks existing compilation results and builds AMD64 images |
| Deployment | Manually triggered GitHub workflow calling Coolify's private API |

The Coolify server is a persistent tailnet member. Each deployment runner joins as an ephemeral member, contacts Coolify, and is cleaned up afterward. GitHub OIDC authenticates that runner without a reusable Tailscale auth key. [Tailscale GitHub Action](https://tailscale.com/docs/integrations/github/github-action)

## 1. Prepare the provider firewall and install Ubuntu

In your hosting provider's dashboard, install Ubuntu Server 24.04 LTS with an SSH public key for your login account. Select the AMD64 image for this server. Record the login account, public addresses, and browser/serial-console recovery method.

Attach a stateful provider firewall with these rules before installing Coolify:

| Direction | Protocol/port | Rule |
| --- | --- | --- |
| Public inbound | TCP 80 | Allow |
| Public inbound | TCP 443 | Allow |
| Other unsolicited public inbound | All | Deny |
| Established/related return traffic | As required by the provider | Allow |
| Outbound | All | Allow |

Apply the policy to IPv4 and IPv6. Do not open public SSH 22, Coolify 8000/6001/6002, database ports, backend ports, or UDP 41641.

Use the provider's browser/serial console for bootstrap. Keep that recovery path available. This guide relies on the provider firewall to enforce public exposure, because Docker port publishing can bypass ordinary UFW rules. If the provider offers no firewall, establish equivalent Docker-aware host filtering before exposing Coolify. [Coolify firewall](https://coolify.io/docs/core/infrastructure/servers/firewall), [Docker and UFW](https://docs.docker.com/engine/network/packet-filtering-firewalls/)

## 2. Update Ubuntu and set the hostname

Run in the provider console. The commands use `sudo`; they also work from the initial root account when sudo is installed.

```bash
sudo apt-get update
sudo apt-get upgrade -y
sudo apt-get install -y curl ca-certificates openssh-server
sudo systemctl enable --now ssh
sudo hostnamectl set-hostname coolify
```

If `/etc/hosts` has a `127.0.1.1` entry containing the old hostname, edit that entry to use `coolify`. Keep the localhost entries.

```bash
sudo nano /etc/hosts
```

If this is a cloud-init image, preserve the selected hostname across boots:

```bash
if command -v cloud-init >/dev/null 2>&1; then
  printf 'preserve_hostname: true\n' | sudo tee /etc/cloud/cloud.cfg.d/99-preserve-hostname.cfg >/dev/null
fi
sudo reboot
```

Reopen the provider console after reboot and verify:

```bash
hostnamectl --static
uname -m
nproc
free -h
df -h /
```

The hostname must be `coolify`. `aarch64` means ARM64; `x86_64` means AMD64. Record the actual architecture so the GitHub runner and images match it. Filesystem capacity may be lower than the advertised disk size.

## 3. Install Tailscale and establish private SSH

Run on the server through the provider console:

```bash
curl -fsSL https://tailscale.com/install.sh | sh
sudo tailscale up
sudo tailscale set --hostname=coolify
tailscale status
tailscale ip -4
```

Open the authentication URL printed by `tailscale up` and add the server to your existing tailnet. Approve the machine if your tailnet requires device approval. In Machines, verify its name is `coolify`. For unattended operation, disable this server's key expiry or arrange renewal before expiry.

Keep the existing tailnet access policy. Do not add ACLs, grants, groups, or server network tags for this setup. The provider firewall remains the public boundary.

With Tailscale connected on your computer, test ordinary key-based OpenSSH to the server's Tailscale IP:

```bash
ssh ubuntu@100.x.y.z
```

Replace `ubuntu` with your actual login account and `100.x.y.z` with the address printed above. Use the private key matching the public key installed with Ubuntu. When MagicDNS resolves the machine, `ssh ubuntu@coolify` also works. Keep the provider console available until the new connection succeeds.

No additional public inbound port is required. Tailscale can relay traffic when a direct connection cannot be established. This guide uses ordinary OpenSSH over Tailscale and does not require enabling Tailscale SSH. [Ubuntu installation](https://tailscale.com/docs/how-to/secure-ubuntu-server-with-ufw), [Tailscale CLI](https://tailscale.com/docs/reference/tailscale-cli), [Tailscale firewall behavior](https://tailscale.com/docs/integrations/firewalls)

## 4. Install Coolify

Run through private SSH or the provider console:

```bash
curl -fsSL https://cdn.coollabs.io/coolify/install.sh | sudo bash
```

Use the official installer for the current release and record the installed version. Let it prepare Docker and its localhost management connection. After it finishes:

```bash
sudo docker version
sudo docker compose version
sudo docker ps
```

The server runs prebuilt application images. You do not need to install a project build toolchain or a self-hosted GitHub runner here. [Coolify installation](https://coolify.io/docs/start-with-self-hosted)

## 5. Configure Coolify privately

From a computer connected to Tailscale, open the server's private address:

```text
http://100.x.y.z:8000
```

This HTTP connection travels inside Tailscale's encrypted network. Keep the dashboard/API private; do not configure a public dashboard route on port 443. The application's public HTTPS hostname is configured separately later.

In Coolify:

1. Create the administrator account and enable two-factor authentication. Save recovery codes privately.
2. Open the installer-created localhost server under Servers. Set its display name to `coolify`, retaining the installer's SSH address, user, and key.
3. Validate the connection and confirm the server is reachable.
4. Start the server's proxy using Coolify's default proxy configuration. It owns public ports 80 and 443.
5. If setting the Coolify instance URL, use its private dashboard URL, not the application domain.
6. Create project **Constitution Atlas** with environments **test** and **prod**.

Preserve the installer's key-based root/localhost SSH connection: Coolify needs it to manage the host. Public port 22 remains closed. [Coolify OpenSSH](https://coolify.io/docs/core/infrastructure/servers/openssh), [Coolify 2FA](https://coolify.io/docs/core/security/authentication/2fa)

## 6. Configure the application's public DNS

At your DNS provider, add an A record for the complete hostname:

| Type | Hostname | Value |
| --- | --- | --- |
| A | `tst.verfassungen.julianhoelz.de` | Server's public IPv4 address |
| A | `verfassungen.julianhoelz.de` | The same public IPv4 address |

Some providers expect the name relative to your DNS zone. Add AAAA only if the server's IPv6 route and firewall work for the same application.

From your computer:

```bash
dig +short tst.verfassungen.julianhoelz.de A
dig +short tst.verfassungen.julianhoelz.de AAAA
dig +short verfassungen.julianhoelz.de A
dig +short verfassungen.julianhoelz.de AAAA
```

The application resources use their respective HTTPS domains. DNS alone does not create the application or certificate. [Coolify DNS](https://coolify.io/docs/core/networking/dns)

### 6.1. Prepare SSL/TLS with Let's Encrypt

Follow the deployment guide's [HTTPS with Let's Encrypt](Manual-Deployment#https-with-lets-encrypt) section before the first manual deployment; CD creates the applications and their domain routes. It covers the default Traefik HTTP-01 resolver, each `edge-proxy` HTTPS domain with internal target port `80`, public certificate checks and automatic renewal. Keep public TCP ports **80 and 443** open; the dashboard and API remain private through Tailscale. No Certbot installation or additional GitHub SSL secret is needed. Certificates are requested when the application route is deployed, then verified after the first manual GitHub deployment.

## 7. Configure the ephemeral runner's Tailscale identity

The runner needs an identity tag for authentication. This is the only tag metadata required; keep the tailnet's existing network permissions and add no ACL/grant rules.

Select an existing tag you are authorized to assign and record it as `TS_TAGS`. If none exists, create an identity tag such as `tag:github-deploy` with your administrator as its owner in Tailscale's tag editor. Do not assign this runner tag to the persistent `coolify` server. [Tailscale tags](https://tailscale.com/docs/features/tags)

In the Tailscale admin console, open Trust credentials and create a federated identity using OpenID Connect:

| Field | Value |
| --- | --- |
| Issuer | `https://token.actions.githubusercontent.com` |
| Subject | `repo:julianhoelz94@26120868/Verfassung@1341839964:environment:*` |
| Scope | `auth_keys` with write access |
| Allowed tag | The tag recorded as `TS_TAGS` |
| Custom claim `repository` | `julianhoelz94/Verfassung` |
| Custom claim `ref` | `refs/heads/main` |
| Custom claim `workflow_ref` | `julianhoelz94/Verfassung/.github/workflows/deploy.yml@refs/heads/main` |

This subject follows GitHub's current default for repositories created after 15 July 2026. This repository was created on 21 August 2026; its verified owner ID is `26120868` and repository ID is `1341839964`. It replaces the older name-only subject from the initial guide. Verify the actual token claims during the first connection check if repository OIDC customization is enabled. [GitHub OIDC subject format](https://docs.github.com/en/actions/reference/security/oidc#immutable-subject-claims)

Copy the generated Client ID and Audience. They are identifiers, not passwords. The deployment job lives in `deploy.yml`, runs from `main`, and references the selected GitHub environment `test` or `prod`. The subject wildcard permits both environments while the repository/ref/workflow claims retain their restrictions. These checks authenticate GitHub; they do not change tailnet network access. [Workload identity federation](https://tailscale.com/docs/features/workload-identity-federation)

## 8. Enable Coolify's private API and create tokens

In Coolify Settings > Advanced > API and MCP, enable API access. Leave Allowed API IPs empty for this trusted-tailnet setup so ephemeral runner addresses do not require manual updates. The API remains protected by its Bearer tokens and the provider firewall. [Coolify API settings](https://coolify.io/docs/api/ip-allowlist)

Select the team containing Constitution Atlas before opening Keys & Tokens > API Tokens. Create two credentials:

| Suggested token name | Permissions | Purpose |
| --- | --- | --- |
| `github-test-deploy` | `deploy` | Start a selected deployment |
| `github-test-config` | `read` and `write` | Select release configuration and inspect deployment status |

Store the complete token values, including any prefix and separator, directly in the GitHub environment secrets below. Deploy-only tokens do not supply the configuration/status permissions. A root token and sensitive read access are not required for the planned path. [Coolify API permissions](https://coolify.io/docs/api/permissions)

## 9. Prepare GitHub environment variables and secrets

In `julianhoelz94/Verfassung`, open Settings > Environments, create **test** and **prod**, and allow deployments from branch **main**. [GitHub environments](https://docs.github.com/en/actions/how-tos/deploy/configure-and-manage-deployments/manage-environments)

Add these environment variables:

| Name | Value |
| --- | --- |
| `COOLIFY_URL` | `http://100.x.y.z:8000`, using the actual Tailscale IP and no `/api/v1` suffix |
| `TS_CLIENT_ID` | Federated identity Client ID |
| `TS_AUDIENCE` | Generated Audience copied from Tailscale |
| `TS_TAGS` | Selected runner identity tag, for example `tag:github-deploy` |
| `PUBLIC_BASE_URL` | Test: `https://tst.verfassungen.julianhoelz.de`; prod: `https://verfassungen.julianhoelz.de` |
| `COOLIFY_PROJECT_UUID` | The Coolify project UUID |
| `COOLIFY_SERVER_UUID` | Server UUID from **Servers → coolify**, copied from the URL after `/server/` |

Add these environment secrets:

| Name | Value |
| --- | --- |
| `COOLIFY_DEPLOY_TOKEN` | Complete deploy-only Coolify token |
| `COOLIFY_CONFIG_TOKEN` | Complete read/write Coolify token |

Do not add a reusable Tailscale auth key or OAuth secret for the OIDC method. The deployment job requests a GitHub identity token with `id-token: write`, then supplies `TS_CLIENT_ID`, `TS_AUDIENCE`, and `TS_TAGS` to the Tailscale action. Its ephemeral node is cleaned up after the job. [Tailscale action authentication](https://tailscale.com/docs/integrations/github/github-action)

## 10. Prepare image pulls if GHCR images are private

Public GHCR images can be pulled anonymously. For private images, create a GitHub personal access token (classic) with `read:packages` for a user who can read the packages. Authorize it for the organization if required.

On the default root-managed Coolify host, run this in Bash. Input is prompted so the token is not entered as literal shell history:

```bash
read -r -p 'GitHub username: ' GHCR_USER
read -r -s -p 'GHCR read token: ' GHCR_READ_TOKEN
printf '\n'
printf '%s' "$GHCR_READ_TOKEN" | sudo docker login ghcr.io --username "$GHCR_USER" --password-stdin
unset GHCR_READ_TOKEN GHCR_USER
```

If you later change Coolify's SSH management user, configure registry authentication for that user. Verify a pull when the first image exists. GitHub runners publish with their job token and the required package permission; the server only needs pull access. [GHCR authentication](https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-container-registry)

## 11. Host-level backup

This host is backed up by the operator. No application backup container is included in the Coolify runtime. Ensure the host backup covers Docker persistent volumes and Coolify's management state, including `/data/coolify/source/.env` and `/data/coolify/ssh/keys/`. These contain restoration keys; preserve them securely. Host snapshots of running databases need an appropriate consistency/recovery strategy, and restore verification remains an operator task. CD performs no backup or restore. [Coolify restoration requirements](https://coolify.io/docs/core/backup-and-recovery/instance-restore)

## 12. Verify server preparation

- The Ubuntu hostname and Tailscale machine name are `coolify`.
- Your computer can open a new SSH connection through Tailscale and reach the private Coolify dashboard.
- Coolify validates its management connection and its proxy is running.
- Public IPv4 and IPv6 exposure allows only TCP 80 and 443. Check from outside the server; ports without a listening service may be closed even when the firewall permits them.
- Coolify 8000/6001/6002, SSH 22, databases, and backend ports cannot be reached through the public address.
- Existing tailnet network permissions are unchanged; no custom ACLs or grants were added.
- DNS points to the intended host; GitHub environments `test` and `prod`, variables, secrets, and federated identity are configured.
- The host-level backup includes persistent database/application data and Coolify restoration keys.

Record the server architecture, Ubuntu/Coolify/Docker versions, public and Tailscale addresses, project/environment identifiers, chosen tag, registry visibility, and backup destination. Keep secret values in secret stores.

## 13. Configure the applications and manual workflow

[Continue with the manual deployment guide](Manual-Deployment).
