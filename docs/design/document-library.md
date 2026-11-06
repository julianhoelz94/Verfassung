# Central document library

This extends the completed document-service work (VER-238–VER-242) and supersedes
the navigation, library and storage proposals in `document-service-plan.md`.
Scope is phases 1–5; Zotero synchronization remains future work. Linear issue
creation was attempted but the workspace's free issue limit was exhausted.

## Interface and roles

Documents is a primary destination for editors, reviewers, publishers and admins.
`/documents` is the protected shared library. Existing `/documents/[id]?revision=`
links remain public citation pages, authorized by the exact published revision.
Legacy editorial pages redirect to the library, retaining document/return context.

The interface follows `ui-templates.md`: shared page templates and fields, warm
paper/white surfaces, green accents, regular serif headings, native controls, CSS
Modules and runtime spacing tokens. The shared viewer/editor toolbar toggles project-folder navigation and a resizable
bottom details drawer. Phones use a nearly full-height drawer; hiding it preserves
unsaved inputs and selection. Results stay in place. Project backing tags are not
repeated in navigation; descriptive tags are managed inside the drawer. Copy is
English/German; keyboard/touch actions accompany drag and drop. Technical identifiers remain secondary to titles and citations.

Editors/admins manage records, folders, tags, files and imports. Reviewers and
publishers inspect the complete library/history, download and export. Viewer and
anonymous access is limited to public citations. The service enforces these rules
independently of navigation and gateway controls. Folders never change visibility.

## Identities and bibliography

An immutable UUID identifies a document. A user-editable citation key resolves to
that UUID. Keys use `[A-Za-z][A-Za-z0-9_:-]{0,127}` and are case-insensitively unique
including archives and aliases. Availability checks help editors; the database
constraint decides concurrent saves. Renaming retains the old key as an alias.
Existing documents receive generated keys; older clients may continue omitting
them.

Revisions snapshot the key and structured bibliography: type, ordered personal or
institutional authors/editors, issued date, container title, publisher,
volume/issue/pages, DOI, ISBN, language, abstract and additional fields. Metadata-only
records are valid. Omitted key/bibliography on legacy updates preserve values.
Expected-revision writes prevent silent overwrites.

## Folders and tags

Each folder is a named view over one stable tag ID. Adding membership adds its
tag; removing membership removes only that tag. A document can belong to several
folders and always remains in All documents, subject to the explicit archive
filter. Deleting a folder retains documents and its tag. Renames preserve IDs.
Organization records events without creating bibliographic revisions. Bulk
actions preserve existing membership and offer undo for completed changes.

Search/sort is server-side and paginated. Embedded editor pickers use bounded
search and load revisions only for the selected document. Create/upload/attach
remains in place, preserving unsaved input and the transactional retry receipt.

## Files and compatibility

Immutable file rows store bytes, size and checksum; immutable revision manifests
reference them. Metadata revisions reuse file identities. Adding/removing an
attachment or choosing a primary file produces a new document revision. Historical
manifests and bytes remain unchanged.

The forward migration preserves historical primary-file downloads and wiki image
consumers. Public attachment reads check the exact published revision and its
manifest. New attachments never become available through an older citation. Bytes
remain in Document Postgres, included in existing database backups. External object
storage is a separate future migration.

## BibTeX

Import accepts paste or `.bib` upload: preview, explicit decisions, confirmation.
Each entry can be created, skipped, update a chosen revision, or use an existing
record. Duplicate candidates and key conflicts require explicit resolution.
Imports are transactional and retry-safe by actor/operation identity. File paths
remain metadata; the server never reads those paths.

Import works at library and folder scope. The folder's backing tag is applied to
every created, updated or explicitly adopted record. They remain in All documents.
Reusing a record does not silently update its metadata or publish it.

Export supports the active library, the complete active membership of a folder,
and selected records. Pagination does not limit exports. Combined folder/selection
exports validate membership. Preserve supported metadata, keys, unknown fields and
source TeX where possible; warn when conversions require interpretation. Explicit
selection also supports archived records. Unfiltered library/folder exports include
active records.

Every scope offers **BibTeX only (.bib)** or **BibTeX with files (.zip)**. Plain
BibTeX omits `file`, including imported paths. The ZIP contains `references.bib`
and every attachment in each exported current revision, streamed one file at a
time from its immutable manifest. A generated `file` field lists semicolon-separated
relative paths within the ZIP; entries without attachments have no `file` field.
Paths use document UUID directories and file UUID prefixes with sanitized filenames to prevent
collisions and unsafe extraction paths. Extract the ZIP before importing the
bibliography into a local reference manager. Imported local paths are retained
privately as metadata but never read, bundled, or exposed in public projections;
internal TeX preservation fields are also omitted from public metadata.

## Verification and invariants

Checks cover concurrent key collisions, aliases, legacy updates, multi-folder
membership, roles, attachment manifests/exact historical bytes and public access.
BibTeX coverage includes parsing, Unicode/TeX names, unknown fields, conflicts,
folder import/export, rollback and replay. Gateway checks cover trusted origins,
bounded pickers and preserved input. Browser journeys cover organization and
folder import/export plus English/German reflow and accessibility.

No library change creates a legal version or rewrites a published citation.

### Verification evidence

- Document-service `check`: 57 tests passed, including the V9 upgrade, real
  PostgreSQL library/BibTeX/attachment operations and existing service regressions.
- Gateway `lint`, production `build` and test suite passed: 1,432 Vitest tests and
  42 Node tests. The original reviewer/verifier pass was followed by a focused review of the
  drawer and export changes; confirmed public-metadata and archived-export defects
  were corrected. Kotlin and TypeScript complexity gates pass without exceptions.
- Latest drawer/ZIP pass: 52 focused gateway tests and four browser journeys
  passed, covering both export formats and scopes, read-only permissions, retained
  drafts, drawer/folder toggles, English/German reflow and accessibility.
- Browser regression suite: 160 passed; two golden screenshot tests skipped.
  Final focused library/amendment rerun: six passed, including drag/drop, Undo,
  per-folder import/export, direct publisher denial and accessibility across
  mobile layouts. English/German captures were inspected at 320/390/820/1440px.
- The pinned Playwright browser/image downloads were denied by environment network
  policy. Browser journeys used installed Chromium with the existing visual-skip
  switch; no golden baseline was changed. These journeys use synthetic API
  fixtures, while service tests exercise actual Postgres. A forced run of the two screenshot tests with system Chromium did execute,
  but the pixel comparisons failed with the unpinned browser. Baselines remain
  untouched. Subsequently, the pinned CI visual suite passed all 29 tests and
  the deployed-stack browser suite passed all 58 journeys. Recovery discovery was
  updated to recognize primary-file manifests as well as legacy inline bytes;
  its SQL was checked against PostgreSQL 16 and the operations tests cover both
  storage layouts and public/private candidate selection.
