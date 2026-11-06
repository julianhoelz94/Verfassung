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

## Reuse plan

| Priority | Location and entry point | Benefit and next work |
| --- | --- | --- |
| Already used | Constitution configuration: `app/admin/constitutions/[id]/page.tsx`; editor Documents panel: `app/editor/EditorSessionView.tsx` | General sources for a constitution, such as foundational acts, scans and research. Both already embed `DocumentLinks` with a constitution target; retain that shared implementation. These attachments apply to the constitution as a whole, rather than to the text version currently selected in the editor. |
| Already used | Amendment Documents task: `app/editor/amendments/[id]/page.tsx` and `AmendmentForm.tsx`; historical inspection: `AmendmentRevisionDocuments.tsx` | Sources for the whole saved amendment draft, with exact draft scope and pinned document revisions. Historical evidence is read-only. A new unsaved amendment currently asks the user to save first; staging attachments through the host save is a possible later improvement. |
| Implemented | Whole-amendment and exact-change materials: `app/components/history/RecordMaterials.tsx` | The existing public material sections now embed the shared template via `DocumentLinks`. Editors/admins can browse, upload complete bibliography, attach a pin and save a contextual citation note. Commentary remains a separate action. `amendment_material` identifies the whole published act; `change_material` uses its exact change ID. |
| Implemented | Constitution lifecycle materials: `app/components/history/RecordMaterials.tsx`, `app/editor/lifecycle/[constitutionId]/page.tsx` | Existing saved events expose the shared template with `lifecycle_material`, constitution ID and exact event scope. Publishers/admins can attach existing sources and add commentary; uploading library files requires library-writing rights as well. Attachments are added after the event is recorded, so retrying an attachment cannot create another event. Legacy `sourceUrl` and evidence corrections remain compatible. |
| Implemented | Provision-event Sources section on the same lifecycle editor page | The same event-scope contract validates provision-event IDs against the owning constitution. Sources retain their source-version and affected-provision context. Public country History displays their exact cited snapshots and passage notes. |
| Implemented | Version archival sources: `app/editor/SourceEvidenceWorkspace.tsx`, `ConstitutionDetailsWorkspace.tsx`, composed by `EditorSessionView.tsx` and `editor/page.tsx` | Sources use the exact selected `version` ID, separate from general constitution attachments. The shared adapter saves them in place while preserving unsaved source-description corrections. Public version readers display their pinned snapshots and notes. These supporting attachments save independently; the narrative source correction keeps its existing review/publication workflow. |
| Later | Wiki bibliography and image reuse: `app/components/WikiEditorTemplate.tsx`, `app/editor/wiki/actions.ts` | Replace repeated source-URL entry with reusable, pinned citations for country, constitution and jurisdiction Wiki pages after the Wiki source contract supports them. Wiki images already store document/revision references: a library picker could add existing-image selection, but must filter compatible files and retain image-specific alt text, captions, credits, rights and placement. The current atomic create-and-link adapter does not cover Wiki targets. |
| Later | Import review, setup proposals and migration evidence: `app/editor/ImportReview.tsx`, `app/admin/import/setup/SetupProposalReview.tsx`, `app/admin/migrations/[id]/page.tsx` | Choose a source already in the library or add supplementary evidence during reconciliation. Migration captures already expose stored document IDs and revisions; reuse them instead of creating duplicates. Add job/proposal reference support where absent. Preserve original captured bytes, checksums and import provenance; selecting supplementary evidence must not replace the capture. |
| Later: needs authored-reference design | Article annotations and footnotes: `app/editor/FootnoteMarkerMenu.tsx`, structured annotation/reference types in `lib/api.ts` and the continuous editor | Insert a document citation with a locator at a precise passage. Define structured document/revision references, serialization and reader rendering first. Keep source-authored footnotes separate from editorial evidence, and retain the passage's stable identity. |

The first three integrations are implemented. Wiki citations and import reconciliation remain later work once their owning records can save pinned references. Public readers, History and comparisons should display the resulting published citations through their existing read components; they should not show upload or library-search controls. The central library retains its management UI and only shares appropriate metadata fields with this compact attachment template.

Do not broaden public access merely because a document is selected. Each new host must define publication/readability rules for the exact cited revision. Existing event source URLs and historical citations remain compatible; new managed pins need a deliberate contract rather than an inferred URL relationship.

## Reuse audit after the main update

Reviewed 7 November 2026 against `main` at `d970ee0` (merged PR #247). The shared History, amendment and lifecycle viewers are now on main. Compared with the commentary branch already integrated into this PR, the final main update adds History/viewer regression coverage rather than another source-owning workflow.

- **Amendments and exact changes:** `RecordViewerPage.tsx` renders `RecordMaterials` for both the published act and each stable change ID. This PR already uses the shared attachment template at those entry points. The same viewer handles country and regional routes; no separate regional picker is needed.
- **Lifecycle and provision events:** the published lifecycle viewer and saved event editor remain the correct attachment owners. This PR covers both. A newly composed event still needs its saved event ID before linking sources.
- **Consolidated comparisons:** `ComparisonEvidence.tsx` now has direct regression coverage on main. It displays the owners' published evidence; `ConsolidatedComparisonView.tsx` already links each contributing change to its exact amendment/change anchor while preserving the return comparison. Keep source editing on those owners instead of adding a comparison-owned attachment store. The combined tests also check that different passage notes survive reuse of the same document snapshot.
- **Next practical addition — Wiki image reuse:** Wiki images already have document/revision pins. The picker can offer existing compatible images while the Wiki retains alt text, captions, rights, credits and placement. Bibliographic Wiki citations are a separate change: `WikiPageRevision.sourceUrls` is still a URL list and needs a pinned-source contract.
- **Import/setup/migration review:** the source-URL displays and captured document/revision references are unchanged. Reuse stored captures and add supplementary evidence only through a job/proposal-supported contract; keep captured bytes and checksums intact.
- **Article annotations and footnotes:** the structured annotation/reference model is unchanged. Define authored document citations and their rendering before embedding an attachment picker there.

No additional automatic migration of a source form is needed for this main update. The next recommended reuse work is existing-image selection in Wiki editing, followed by managed Wiki bibliography and supplementary import evidence. The interactive mock remains a sample-data preview; this audit does not deploy the platform.

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
