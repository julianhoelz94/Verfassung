# Reusable document attachment template

`app/components/documents/DocumentAttachmentTemplate.tsx` is the shared presentation component. It accepts library pages, folders, revision histories, permissions, pending/error state and create/attach/detach callbacks. It knows neither the host entity type nor how that entity saves. `DocumentManager` provides the existing HTTP adapter; `DocumentLinks` supplies authorized initial data. The previous `DocumentManagerTemplate` import remains a compatibility export.

## Interaction

The closed component shows linked evidence and two equal actions (the chosen mode becomes green and pressed): **Upload new document** and **Choose existing document**. Upload initially exposes file and title. Title and either a file or source URL are required. **Optional details** reveals compact source/key fields and item type; a separate **Library note** disclosure contains Description. Further disclosures reveal creators, publication details/abstract, and additional bibliography fields. Personal and institutional creators use the same fields as the central document inspector. Failed writes and switching between browse/upload preserve inputs.

The browser uses a full-width live-search combobox with immediate searches, bounded results and optional project-folder selection. Existing suggestions remain visible and selectable during refresh, without a loading indicator, and are replaced when the latest results arrive. A chosen citation survives a pending search replacing its result page. Arrow keys navigate matches, Enter selects a record, and Escape closes suggestions. Selection never submits the surrounding form or attaches automatically. There is no separate document selector or search button. It loads revision histories only for the chosen document. The current revision is the default explicit pin; **Citation options** permits a historical pin. The attached document title opens the exact cited snapshot. Library management and full revision history belong in the document service; this compact widget has no extra History or Open full library links. Removing an attachment keeps the document in the library.

Controls are safe inside a host form: they do not render nested forms, associate their inputs with that host, validate its fields or submit it. Unbound instance-specific `form` attributes keep document inputs out of the host's native constraint validation. The upload component validates its own fields explicitly, opening the appropriate disclosure before showing an invalid field.

## Keep metadata and commentary distinct

**Abstract** is the source's own published summary and stays in bibliography metadata. **Description** is a catalog note about the shared document, shown under Library note; it is not a summary copied from Abstract. BibTeX imports populate Description from `note`, while `abstract` remains independent.

**Citation notes / relevant passages** belong to an attachment's owner context. The referenced amendment-viewer design supports commentary/materials for a whole amendment, an exact highlighted change, and lifecycle events, with per-owner permissions and comparison provenance. A note such as “Chapter 3 explains this amendment” must retain that amendment/change/event association instead of changing the shared document's metadata.

The template exposes `contextFields(mode)` before the action row and `renderAttachmentContext(link)` beside attached evidence. A host can put its existing commentary/material editor there and capture that owner's state in the callbacks. These slots render host UI. Live attachment notes are stored as `citationNote` on the scoped document-link event, independently of document bibliography and revision metadata (Document migration V14). They are returned in link projections, retained when material details advance a citation pin, and displayed with their exact scope in public evidence and comparisons. Broader commentary uses the existing amendment/change/lifecycle material contracts. The standalone preview stages notes locally.

## Embed an existing supported target

In a server component, use the existing loader/controller:

```tsx
<DocumentLinks
  targetType="constitution"
  targetId={constitution.id}
  returnTo={currentRoute}
  canEdit={canEditConstitution}
/>
```

Use `targetType="amendment"` and the current `scopeRevisionId` for amendment drafts. `version` is also supported. The loader narrows the caller's rights to document permissions; it does not trust `canEdit` alone. For a client editor, pass server-loaded links/page/folders to `DocumentManager` rather than nesting an async server component inside a client component. Import the component using the host route’s relative path to `editor/documents/DocumentLinks`.

For a new owner, implement this target-independent callback boundary:

```tsx
<DocumentAttachmentTemplate
  links={attachments}
  documents={libraryPage.items}
  folders={projectFolders}
  revisions={selectedRevisionCache}
  documentTotal={libraryPage.total}
  documentOffset={libraryPage.offset}
  canEdit={canChangeEvidence}
  canCreate={canCreateLibraryRecords}
  pending={savingEvidence}
  searchPending={searching}
  revisionPending={loadingRevisions}
  error={evidenceError}
  onSearch={searchLibrary} // (query, offset, folderId?) => Promise<boolean>
  onSelect={loadSelectedRevisions}
  contextFields={renderOwnerMaterialFields} // optional; owner-scoped commentary
  renderAttachmentContext={renderOwnerMaterialSummary}
  onCreate={createAndAttach} // FormData with title/file and complete optional metadata
  onAttach={attachPinnedRevision} // (documentId, revisionId) => Promise<boolean>
  onDetach={detachFromOwner}
/>
```

The host implements these named callbacks, HTTP authorization and persistence. Resolve `true` only after the operation is saved or staged as promised; resolve `false` on failure and expose an error. Current create-and-link endpoints persist the bibliography and optional citation key together with the file and pin in Document's transaction. Existing retry hashes remain compatible when the new fields are omitted. A host with a not-yet-saved entity stages pins until its own save succeeds and reconciles partial failure explicitly.

## Implemented integrations

| Owner | Picker behavior and persistence |
| --- | --- |
| Constitution and exact version | `DocumentLinks` / `DocumentManager` save pinned sources independently of unsaved narrative corrections. General constitution sources remain distinct from version sources. |
| Amendment drafts, including first save | `StagedDocumentPicker` selects/uploads before a new amendment exists. The owner resolves pins before creation, uses Amendment's creation receipt and attaches to the returned draft revision. A partial pin failure returns the saved amendment identity, keeps the composer mounted and retries against that owner. Historical inspections remain read-only. |
| Published amendment and individual change materials | `RecordMaterials` shares the existing template, preserving exact owner scope and separate commentary. |
| Constitution and provision events, including first save | Both composers stage references until Catalog returns the saved event. Actor-scoped creation receipts prevent duplicate events after a partial failure. Publisher/admin users can select existing sources; library creation additionally requires editor/admin. |
| Country, constitution and jurisdiction Wiki | Bibliographic citations persist exact document revisions, titles and contextual locators. Image browsing is filtered and paginated by supported raster MIME types; uploads require a compatible image file. Alt text, caption, credit, rights, source and placement belong to the Wiki. Publication verifies all pins; old published revisions retain their original citations. Legacy source links remain optional. |
| Import job, setup proposal and migration run | `DocumentLinks` adds supplementary evidence with private `import_job`, `setup_proposal` and `migration_run` targets validated over Ingestion HTTP. Captured bytes, checksums and original capture references are untouched. |
| Structured passages and footnotes | The References tool and note editor embed the picker. A structured `document` reference stores `documentId`, numeric `documentRevision` and optional `locator` at exact UTF-16 offsets. Canvas edits, note Apply, replay, import/export, preview, reader and note drawers retain these fields. |

### Staged adapter

```tsx
<StagedDocumentPicker
  name="stagedDocuments"
  form="owner-form" // optional when the picker is already inside that form
  canCreate={canWriteLibrary}
/>
```

The hidden field contains only `{documentId, revision, citationNote?}` references. Resolve it through `resolveDocumentReferences` before saving the owner, then use `pinDocumentReferences` with the exact returned owner/scope. Client titles and revision UUIDs are never trusted. A selection-only host can supply `onChoose(link)` instead, as Wiki images and text citations do.

`POST /library/documents` commits the library record, immutable file, metadata and actor/operation receipt atomically without an owner link. Cancelling the surrounding record leaves the uploaded library item available for reuse. Repeated uploads return the same snapshot; changed payloads with the same operation ID conflict. Unchanged older linked-create request hashes remain compatible. Failed requests preserve entered values. The staged UI explains that selections save with the owner and uploads remain in the library.

### Citation publication

Catalog validates the full Content snapshot before publication. When it contains document references, Document reads that exact version/generation over HTTP and registers only the references present there. Dedicated `passage_citation` scopes retain multiple revisions of one document in a version. Missing snapshots or document revisions block publication. Public document reads also verify the exact pin remains in the published Content snapshot, so removed draft citations never grant public file access. Directly writing or detaching a passage citation through the ordinary links API is rejected.

Wiki saves use a stable operation identity so failed pin writes can retry the same unpublished draft. Wiki publication verifies both compatible image pins and bibliography pins. A picture and bibliography citation using the same document must select the same revision because the Wiki relationship has one pin per document. Exact historical published Wiki pages determine public visibility, independently of later library edits.

Public history and comparisons continue to project the owners' published sources; they do not acquire their own attachment store. All service exchanges use HTTP, with additive migrations in the owning database.

## Skill and interactive preview

Use `$verfassung-document-attachments`, defined in `.agents/skills/verfassung-document-attachments/SKILL.md`, for subsequent integrations.

The user-facing preview is hosted privately at https://document-attachment-studio.sillycurlew.chatgpt.site. Cloud-local HTTP addresses are for internal verification only. Hosting updates reuse the separate checkout and Site identity described in `prototype/document-attachment/README.md`.

The preview in `docs/design/prototype/document-attachment/` bundles the actual shared component and local sample-data callbacks. It demonstrates constitution, amendment and lifecycle hosts, including independent parent-form saves, both languages, folder browsing, historical pins and full optional metadata. The host-owned citation-note slots follow the amendment/change/lifecycle commentary concept. The standalone lifecycle host remains a local simulation; live platform event sources use the scoped material-link API. No files leave the browser.

```sh
node docs/design/prototype/document-attachment/build.mjs /tmp/document-attachment-preview.html
```

Browser verification (serve the generated HTML from its own directory first):

```sh
node docs/design/prototype/document-attachment/verify.mjs http://127.0.0.1:8765
```

Set `PLAYWRIGHT_CHROMIUM_EXECUTABLE` only when deliberately verifying with a system browser instead of the installed Playwright browser. This interaction check does not update golden baselines.
