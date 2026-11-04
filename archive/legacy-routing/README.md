# Retired pre-launch routing

These routes were removed before the site's public launch. This archive preserves
their source and former behavior for reference and possible restoration.

| Removed route | Former behavior | Current destination |
| --- | --- | --- |
| `/legacy?url=…` | Looked up an old archive URL through Catalog's legacy-mapping API and navigated to a validated local published target. A configured legacy hostname was rewritten here while preserving the browser URL and fragment. | No browser legacy-URL resolver or legacy-host routing. Catalog's mapping API and migration evidence remain available. |
| `/countries/{code}/constitution-timeline` | Redirected the earlier standalone constitution-history URL to the combined country history, retaining date/event filters and fragments. | `/countries/{code}/timeline` |
| `/admin/import/{jobId}` | Forwarded an old import-review URL and its error state into the editor. MCP import responses still emitted this alias. | `/editor?importJobId={jobId}`; preparation, approval/rejection, and publication remain separate role-checked actions. |
| `/versions/{versionId}/units/{unitId}` | Loaded the snapshot's owner and redirected a generic passage link to the country or jurisdiction reader, retaining the exact occurrence. | Direct country/jurisdiction reader URLs with an occurrence fragment. Link producers now obtain ownership from Catalog instead of relying on a redirect page. |

The manual import entry `/admin/import`, setup confirmation
`/admin/import/setup/{proposalId}`, and editor import-review screen are active.
Country/jurisdiction readers, historical snapshots, and current country article/unit
reader entry points are active as well.

## Backup format and deployment exclusion

- `manifest.json` records the original Git revision, paths, and SHA-256 hashes.
- `source/` mirrors the original paths with an additional `.txt` suffix. The
  bytes are unchanged; remove that suffix only when deliberately restoring a file.
- The archive is outside the gateway and MCP Docker contexts and outside every
  Kotlin service's source directories. The root `.dockerignore` also explicitly
  excludes `archive/`.
- No application imports this directory. `.txt` copies cannot be discovered as
  Next.js pages or compiled as TypeScript, Kotlin, or Python modules.
- The gateway production build checks its generated route manifest and refuses
  to finish if any retired page or archived source enters the compiled routes.

Supporting routing files and tests are included to explain the former proxy and
TLS behavior. Shared active components remain in their current source locations;
this archive is a historical reference, not a standalone application.

To restore deliberately, verify the backup hashes, inspect the replacements and
current contracts, copy the selected source back to its original location, and
update the retirement build check and tests together. Do not copy the whole
archive into an application source or public directory.
