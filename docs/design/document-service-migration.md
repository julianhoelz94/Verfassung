# Document reference migration

Sprint 48 keeps catalog `sourceUrl` and amendment `documents` fields intact. The document service owns new documents and append-only links. Readers display both managed links and older fields, so migrated records do not require rewriting published catalog or amendment rows.

Run `scripts/migrate_document_references.py` with `DOCUMENT_MIGRATION_TOKEN` set to a staff bearer token and `--base-url` set to the Caddy origin. The default mode prints each proposed create/link action as JSON without writing. Review that output, then pass `--apply`. Repeating the command skips already linked matching records. It copies metadata and URL references; archived `fileId` values are retained as descriptions because legacy file bytes are not available through the reference contract. Upload recovered files later as new document revisions.

The migration does not create legal or editorial constitution hops, alter amendment revisions, or update catalog source rows. New links pin the initial document revision. The original reference remains the fallback until an explicit content policy decides otherwise.
