# Document service plan

## Goal

Give editors a **Documents** workspace to create and maintain source documents, link them to constitutions and legal change records, and inspect every editorial change. A document revision is an editorial revision only: saving one never creates a constitutional legal version, amendment, or timeline event.

## User experience

1. Add **Documents** to the editorial navigation for `editor`, `reviewer`, `publisher`, and `admin`. Editors and admins can write; reviewers and publishers can inspect documents and history. Anonymous readers and viewers reach documents through public constitution and legal-change pages, without a management menu.
2. `/editor/documents` lists documents with search, type, status, and linked constitution filters. Each row shows title, citation, latest revision, last editor, and where it is used. The page offers **New document** to editors and admins.
3. `/editor/documents/new` and `/editor/documents/[id]` provide fields for title, citation, description, issuing body, document date, language, source URL, and an optional uploaded file. At least one usable source URL or file is required before the document is made public. Editors can save a new revision with a required change note, replace a file, or archive a document. Existing revisions remain readable.
4. The detail page has **Links** and **History** sections. An editor can attach or detach a document to a constitution and to a legal change record. The history lists who changed what and when, shows metadata and link differences, and opens any earlier revision. A mistaken revision is corrected by restoring its content as a *new* revision.
5. Constitution pages show linked documents in a Sources/Documents section. Legal-change detail and timeline views show their linked documents with citation, source, and a view/download action. Public readers see only active, released revisions; old revision permalinks remain available where referenced by published records.
6. The **constitution editor** and **amendment editor** each get an **Add document** action in their own editing flow. Editors can search for and attach an existing document or create a new one, then return to the editor with their unsaved work preserved. Both editors show attached documents and let editors detach them with a recorded reason. The amendment form stops asking editors to retype a URL or opaque file ID for every change record.

## Ownership and data model

Create `document-service` with its own Postgres database. It owns document metadata, immutable revision rows, file metadata, and link history. It does not write to catalog or amendment databases. Cross-service identifiers are opaque UUIDs checked through HTTP when a link is created; there are no cross-service foreign keys.

| Entity | Purpose |
| --- | --- |
| `documents` | Stable document ID, current revision ID, creator, timestamps. |
| `document_revisions` | Immutable revision number and predecessor, all user-editable metadata, source URL, file version ID, lifecycle (`draft`, `active`, `archived`), change note, actor, timestamp. Unique `(document_id, revision_number)`. Activation and archiving also create revisions. |
| `document_files` | Immutable upload version: storage key, original name, media type, size, SHA-256 digest, uploader, timestamp. Replacing a file creates a new row. |
| `document_link_events` | Append-only attach/detach events for `constitution` or `amendment` targets, actor, time, and reason. The current link set is derived from the latest event for each pair. |

The stable document ID identifies the work; a revision ID identifies exact metadata and file bytes. Current public links resolve the latest active revision. A published amendment revision should additionally pin the document revision IDs it displayed when published, preserving the historical citation even when an editor later corrects the document. A document edit changes the current public document presentation, but it never rewrites that historical pin or marks an amendment as a new legal change. If a pinned citation needs correction, staff can publish a new **editorial revision of the change record** under the existing amendment workflow.

Store uploads outside the database in a persistent object store or mounted volume, with only keys and checksums in Postgres. Backups must include both database and file objects. Files are private to the service; download goes through a controlled endpoint. Limit size and allowed types (start with PDF), verify the actual file type, and serve downloads with safe content-disposition and no executable inline content. Public external URLs should be restricted to `http`/`https` and displayed as external links.

## API and authorization

Expose the service at `/api/document` through Caddy; the gateway calls the service root over its internal URL. Define its OpenAPI contract before integrating callers.

| API | Purpose |
| --- | --- |
| `GET /documents`, `GET /documents/{id}` | Public active document summaries and current revision; staff queries may include drafts and archives. |
| `GET /documents/{id}/revisions`, `GET /documents/{id}/revisions/{revisionId}` | Editorial history; public access only to revisions pinned by public records. |
| `POST /documents`, `POST /documents/{id}/revisions` | Create and save a new immutable revision. Use expected current revision for conflict detection. |
| `POST /documents/{id}/files` | Upload a file version; return its ID, checksum, and validation result. |
| `POST /documents/{id}/activate`, `POST /documents/{id}/archive` | Control public visibility without deleting history. |
| `GET /documents?targetType=...&targetId=...` | Resolve links for constitution and amendment pages. |
| `POST /documents/{id}/links`, `DELETE /documents/{id}/links/{linkId}` | Attach/detach with an append-only link event. |
| `GET /documents/{id}/file` and revision-specific download | Stream the correct immutable file bytes. |

Document-service authenticates bearer sessions through identity-service for every write and staff history read. `editor` and `admin` can create, revise, link, activate, and archive; `reviewer` and `publisher` have staff read access; public access is limited to released content. Check permissions in the service, not just in gateway navigation. Require an expected revision on writes so simultaneous edits return `409` with the current revision instead of silently overwriting work. Validate target existence with catalog/amendment APIs before linking; if either is unavailable, fail the write and leave existing links intact.

## Integration with existing data

Current amendment revisions store `documents` JSON (`url`, `fileId`, `label`), while catalog versions and sources store source URLs. Add document references through **new** forward-only Flyway migrations; never rewrite applied migrations or published amendment revision rows.

1. Add a document-reference representation to new amendment revisions and the change-record API. Resolve those references through document-service in the gateway. Keep reading legacy inline document entries indefinitely so old records still render.
2. Add constitution-level document links through document-service, using the catalog constitution ID. Keep version-specific `sourceUrl` and provenance fields as version facts. A constitution document link does not silently replace a version's verified source.
3. Offer a staff migration tool that previews legacy URLs/file IDs, deduplicates candidates by normalized URL or file checksum, creates documents, and proposes links. Staff confirm ambiguous matches. Do not edit old published records; new revisions can adopt managed references.
4. Preserve the amendment service's existing quote-review and version-pin behavior. Document revision changes do not trigger `needs_review` for legal text quotes unless the amendment itself is revised.

## Delivery sequence

1. **Contract and storage:** settle file size/type limits and persistent storage, define OpenAPI and public/staff response shapes, scaffold service/DB/Caddy/Compose/CI, add initial Flyway migrations.
2. **Document history:** implement create, revise, activate/archive, upload/download, optimistic concurrency, authentication, and focused API tests proving immutable revisions and file bytes.
3. **Links:** implement validated constitution/amendment links and append-only link events; test attach, detach, missing targets, duplicate links, and service failure.
4. **Website workspace:** add editorial menu entry, list, create/detail forms, file upload, links, history, revision comparison, and restore-as-new-revision; provide clear conflict and validation messages.
5. **Public and editorial integration:** add **Add document** flows inside both the constitution editor and amendment editor, constitution and timeline document sections, revision pins for new published change-record revisions, and legacy fallback rendering.
6. **Migration and rollout:** preview/migrate legacy references where safe, update backup/restore and code maps, run service tests and gateway lint/build plus focused end-to-end journeys for create → revise → link → public view → history.

## Acceptance criteria

- An editor can create a document, upload or link its source, activate it, and attach it to a constitution **from the constitution editor** and to a legal change record **from the amendment editor**, without losing unsaved editor work.
- A reader can open the active document from both locations, with a stable document URL and a working source/download link.
- Every edit, file replacement, activation/archive, and link change records actor, time, and prior state; prior revisions and file bytes remain accessible under their own IDs.
- Two editors cannot overwrite each other silently; a stale save returns a visible conflict.
- Editing a document does not create an amendment, constitutional version, legal timeline item, or amendment quote-review flag.
- Existing inline amendment documents and catalog source links continue to render throughout migration.
- Direct API calls enforce the same role rules as the website.

## Open decisions before implementation

- Choose persistent file storage for local and hosted deployment, plus a maximum upload size. The API and immutable file model do not depend on the vendor.
- Decide whether editors may activate a document immediately or whether document release should require publisher approval. This plan uses immediate editor activation because all document changes are editorial and the requested workflow names editors as managers.
- Decide whether archived documents with public links stay visible with an archive label or only remain reachable through historical revision URLs. This plan preserves historical URLs and hides archives from new link pickers.
