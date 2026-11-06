# Reusable document attachment template

`app/components/documents/DocumentAttachmentTemplate.tsx` is the shared presentation component. It accepts library pages, folders, revision histories, permissions, pending/error state and create/attach/detach callbacks. It knows neither the host entity type nor how that entity saves. `DocumentManager` provides the existing HTTP adapter; `DocumentLinks` supplies authorized initial data. The previous `DocumentManagerTemplate` import remains a compatibility export.

## Interaction

The closed component shows linked evidence and two equal actions (the chosen mode becomes green and pressed): **Upload new document** and **Choose existing document**. Upload initially exposes file and title. Title and either a file or source URL are required. **Optional details** reveals compact source/key fields and item type; a separate **Library note** disclosure contains Description. Further disclosures reveal creators, publication details/abstract, and additional bibliography fields. Personal and institutional creators use the same fields as the central document inspector. Failed writes and switching between browse/upload preserve inputs.

The browser uses a full-width live-search combobox with immediate searches, bounded results and optional project-folder selection. Existing suggestions remain visible and selectable during refresh, without a loading indicator, and are replaced when the latest results arrive. A chosen citation survives a pending search replacing its result page. Arrow keys navigate matches, Enter selects a record, and Escape closes suggestions. Selection never submits the surrounding form or attaches automatically. There is no separate document selector or search button. It loads revision histories only for the chosen document. The current revision is the default explicit pin; **Citation options** permits a historical pin. The attached document title opens the exact cited snapshot. Library management and full revision history belong in the document service; this compact widget has no extra History or Open full library links. Removing an attachment keeps the document in the library.

Controls are safe inside a host form: they do not render nested forms, associate their inputs with that host, validate its fields or submit it. Unbound instance-specific `form` attributes keep document inputs out of the host's native constraint validation. The upload component validates its own fields explicitly, opening the appropriate disclosure before showing an invalid field.

## Keep metadata and commentary distinct

**Abstract** is the source's own published summary and stays in bibliography metadata. **Description** is a catalog note about the shared document, shown under Library note; it is not a summary copied from Abstract. BibTeX imports populate Description from `note`, while `abstract` remains independent.

**Citation notes / relevant passages** belong to an attachment's owner context. The referenced amendment-viewer design supports commentary/materials for a whole amendment, an exact highlighted change, and lifecycle events, with per-owner permissions and comparison provenance. A note such as “Chapter 3 explains this amendment” must retain that amendment/change/event association instead of changing the shared document's metadata.

The template exposes `contextFields(mode)` before the action row and `renderAttachmentContext(link)` beside attached evidence. A host can put its existing commentary/material editor there and capture that owner's state in the callbacks. These slots render host UI; they do not invent a separate document-service comment store. The interactive preview stages such notes locally. Live saving, visibility, stable scope IDs and reuse in consolidated comparisons remain with the amendment/lifecycle commentary implementation.

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
| Next: highest value | Whole-amendment commentary and exact-change materials: `app/editor/amendments/AmendmentForm.tsx` and `AmendmentChangesTable.tsx`, integrated with the planned commentary owner | Attach an explanatory memorandum or scholarly work to the whole amendment or a particular highlighted change, with a relevant passage such as “Chapter 3, pp. 42–45.” Whole-amendment attachments already work; per-change materials and contextual notes need the commentary owner's stable scope and persistence contract. Preserve those scopes in public viewing and consolidated comparisons. |
| Next: highest value | Constitution lifecycle form: `app/editor/lifecycle/[constitutionId]/page.tsx`, `appendLifecycleAction` in `actions.ts` | Sources for adoption, commencement, suspension, restoration and repeal. Stage pins while composing an event, then persist them through an event-supported contract. Current event DTOs store only `sourceUrl` and `note`. Add lifecycle target authorization, visibility, safe retry and read-back before live wiring. Publishers/admins may edit events; publishers need a select-only mode unless they also hold library-writing rights. |
| Next: same lifecycle integration | Provision-event form in the same lifecycle page, `appendProvisionAction` | Evidence that a specified article or set of provisions commenced, was deferred, suspended or restored. Retain source version, affected logical unit IDs and stable event identity. Reuse the lifecycle pin contract; do not attach the evidence merely to the constitution. |
| Next: focused addition | Archival source for a text version: `app/editor/SourceEvidenceWorkspace.tsx`, reached through `ConstitutionDetailsWorkspace.tsx` | Attach the actual scan, gazette or transcription used for one text version. The existing adapter supports a `version` target, but the present editor Documents panel uses a constitution target and source-evidence revisions contain narrative fields only. Decide whether the new pin belongs to the version or a reviewed source-evidence correction, and preserve that publication scope. Keep the source-evidence narrative separate from the library document's Description. |
| Later | Wiki bibliography and image reuse: `app/components/WikiEditorTemplate.tsx`, `app/editor/wiki/actions.ts` | Replace repeated source-URL entry with reusable, pinned citations for country, constitution and jurisdiction Wiki pages after the Wiki source contract supports them. Wiki images already store document/revision references: a library picker could add existing-image selection, but must filter compatible files and retain image-specific alt text, captions, credits, rights and placement. The current atomic create-and-link adapter does not cover Wiki targets. |
| Later | Import review, setup proposals and migration evidence: `app/editor/ImportReview.tsx`, `app/admin/import/setup/SetupProposalReview.tsx`, `app/admin/migrations/[id]/page.tsx` | Choose a source already in the library or add supplementary evidence during reconciliation. Migration captures already expose stored document IDs and revisions; reuse them instead of creating duplicates. Add job/proposal reference support where absent. Preserve original captured bytes, checksums and import provenance; selecting supplementary evidence must not replace the capture. |
| Later: needs authored-reference design | Article annotations and footnotes: `app/editor/FootnoteMarkerMenu.tsx`, structured annotation/reference types in `lib/api.ts` and the continuous editor | Insert a document citation with a locator at a precise passage. Define structured document/revision references, serialization and reader rendering first. Keep source-authored footnotes separate from editorial evidence, and retain the passage's stable identity. |

Recommended delivery order is amendment commentary/material integration, lifecycle and provision events together, then version-specific archival sources. Wiki citations and import reconciliation follow once their owning records can save pinned references. Public readers, History and comparisons should display the resulting published citations through their existing read components; they should not show upload or library-search controls. The central library retains its management UI and only shares appropriate metadata fields with this compact attachment template.

Do not broaden public access merely because a document is selected. Each new host must define publication/readability rules for the exact cited revision. Existing event source URLs and historical citations remain compatible; new managed pins need a deliberate contract rather than an inferred URL relationship.

## Skill and interactive preview

Use `$verfassung-document-attachments`, defined in `.agents/skills/verfassung-document-attachments/SKILL.md`, for subsequent integrations.

The user-facing preview is hosted privately at https://document-attachment-studio.sillycurlew.chatgpt.site. Cloud-local HTTP addresses are for internal verification only. Hosting updates reuse the separate checkout and Site identity described in `prototype/document-attachment/README.md`.

The preview in `docs/design/prototype/document-attachment/` bundles the actual shared component and local sample-data callbacks. It demonstrates constitution, amendment and lifecycle hosts, including independent parent-form saves, both languages, folder browsing, historical pins and full optional metadata. The host-owned citation-note slots follow the amendment/change/lifecycle commentary concept. The lifecycle host is a simulation, not a claim that the current lifecycle API persists document references. No files leave the browser.

```sh
node docs/design/prototype/document-attachment/build.mjs /tmp/document-attachment-preview.html
```

Browser verification (serve the generated HTML from its own directory first):

```sh
node docs/design/prototype/document-attachment/verify.mjs http://127.0.0.1:8765
```

Set `PLAYWRIGHT_CHROMIUM_EXECUTABLE` only when deliberately verifying with a system browser instead of the installed Playwright browser. This interaction check does not update golden baselines.
