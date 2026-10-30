# Deployment information

**Status: pending.** The repository includes a manual GitHub Actions CD workflow for test and production, with automatic application creation/configuration on its first manual run, but its first remote rollout has not been verified. A reliable post-deployment procedure cannot yet be specified. Do not treat the local Compose quick start or a test fixture as a production rollout procedure.

The complete preparation instructions are available here:

- [[Coolify server setup|Coolify-Server-Setup]] — fresh Ubuntu, private Tailscale administration, public HTTPS, GitHub credentials and host backup.
- [[Manual deployment|Manual-Deployment]] — required settings, manual test/prod selection, automatic application configuration, Let's Encrypt and optional prepopulate with compact, extended and scale profiles, account secrets and saved retry journals.

These pages are generated from the repository's canonical guides so the Wiki and repository instructions stay aligned. Their availability does not establish that a remote deployment has succeeded.

After a deployment has been exercised, this page must document, in order:

1. The target environment, responsible operator, CD trigger, artifact/image identity, and required approvals.
2. Required configuration and secret sources, domains, TLS, network routes, persistent Postgres volumes, and backup location, without recording secret values.
3. Database migration and compatibility order for each stateful service, plus rollback limits.
4. The exact first-run bootstrap: administrator access, required account security, site settings, verified legal-page publication, and initial content import or publication. Production must not use local demo fixtures or sample legal details.
5. Search indexing, service health checks, public browser checks, authorization checks, and how to distinguish a healthy but empty site from failed ingestion.
6. Backup and restore verification, monitoring, alerting, incident contacts, and recovery/rollback steps.
7. The go-live gate for real Impressum/Datenschutzerklärung details and hosting/data-flow review tracked in [VER-269](https://linear.app/verfassung/issue/VER-269/publish-verified-legal-details-and-check-german-hosting-before-public).

The checklist is an outline for future documentation, **not an instruction to deploy**. The authoritative local development procedure is [[Development and operations|Technical-Development]].
