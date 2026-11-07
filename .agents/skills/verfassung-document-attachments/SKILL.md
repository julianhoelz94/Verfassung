---
name: verfassung-document-attachments
description: Reuse Constitution Atlas document attachment controls in a constitution, amendment, lifecycle event, or another evidence workflow. Use the shared compact library browser and progressively disclosed upload metadata instead of building a separate picker.
---

# Reuse document attachments

Use this skill when adding or adapting document selection, upload, citation pins, or evidence attachments in Verfassung. Follow `AGENTS.md` and the `verfassung-editorial-design` skill. The code is the source of truth; the preview is a local simulation.

## Find the right layer

Paths are relative to the repository root.

| Responsibility | Owner |
| --- | --- |
| Reusable, transport-independent UI | `apps/gateway-web/app/components/documents/DocumentAttachmentTemplate.tsx` |
| Immediate live combobox, keyboard selection and folder browsing | `DocumentLibraryPicker.tsx` in that directory |
| Upload, optional metadata and validation | `DocumentUploadForm.tsx`, `DocumentBibliographyFields.tsx`, `DocumentCreatorFields.tsx` in that directory |
| Constitution/version/amendment and scoped material client adapter | `apps/gateway-web/app/editor/documents/DocumentManager.tsx` |
| Authorized server-loaded embedding | `apps/gateway-web/app/editor/documents/DocumentLinks.tsx` |
| Gateway commands and bounded folder search | `apps/gateway-web/app/editor/documents/command/route.ts` |
| Shared wire types and HTTP clients | `apps/gateway-web/lib/document-api.ts` |
| Staged selection for new owners, Wiki and text citations | `apps/gateway-web/app/components/documents/StagedDocumentPicker.tsx`, `lib/document-reference-server.ts` |
| Atomic create, upload, pin and retry receipt | `services/document-service/src/main/kotlin/com/constitutionatlas/document/service/EditorDocumentService.kt` |
| Integration examples and rollout plan | `docs/design/document-attachment-template.md` |
| Interactive preview source/build | `docs/design/prototype/document-attachment/` |

`editor/documents/DocumentManagerTemplate.tsx` is a compatibility export. Extend the canonical shared component, not a copy of the old template or an independent host-specific form.

## Integration workflow

1. Identify the host, its saved/draft identity, publication scope, document permissions, and whether selection is staged or immediately attached. Inspect the owning API and current component props before changing a caller.
2. Reuse `DocumentLinks` for supported server-rendered targets, or `DocumentManager` for their client workspaces. For a different host, supply the template's data and callbacks through a small owner-specific adapter. The UI must not implement target authorization or own the host's publication command.
3. Supply bounded library pages, optional project folders, and revision histories only for the selected record. Keep selection and search results consistent when requests finish out of order. Return `false` and expose a localized error on rejected operations so fields and selection survive retries.
4. Keep file/title immediately visible and optional metadata behind labelled native disclosures. Use the full-width live combobox: search immediately while typing, retain visible suggestions during refresh without a loading indicator, support arrows/Enter/Escape, and retain an explicit Attach action. Keep a chosen citation stable if a pending search replaces its result page. Do not reintroduce a second document dropdown or manual search button. Keep citation revision options secondary. Preserve all metadata through the HTTP boundary; do not create with only a title and silently discard bibliography fields. Creation must preserve the actor/operation retry identity, including the new metadata, and commit the document, file and attachment atomically for existing supported targets.
5. Verify the shared consumers and record any target-specific API work still needed. Do not claim live attachment support solely because the target-agnostic UI can render in a mock.

## Invariants

- Citation notes belong on the scoped link (`citationNote`), never in the shared Description or Abstract. Preserve them through material edits, read-only projections and comparisons.
- Attach an explicit document revision ID. Historical citations must retain their exact bibliography and bytes after later changes.
- Detach removes the host relationship; it never deletes or moves the library record.
- Document-service owns documents, immutable files, revisions and attachment relationships. Other services own their entities and publication decisions. Exchange references over HTTP; no cross-service SQL or foreign keys.
- Editors/admins may create library records. Host attachment rights can differ: use `canEdit` for relationship changes and `canCreate` to further restrict uploading. Enforce both at the server, not only in buttons.
- A failed upload, key conflict, service outage, panel toggle or retry must retain entered values. Keep the host's unsaved text and controls mounted.
- Embedded controls must neither create nested forms nor join the host form's constraint validation. Their `form` attributes intentionally use an unbound, instance-specific ID; validation and submission are handled inside the component. Forward that attribute to newly added input/select/textarea controls, including shared creator controls.
- Highlight the selected upload/browse action with its pressed state. Compact optional sections with shared grids and spacing while retaining touch targets.
- Keep attachment navigation minimal: the document title opens its cited snapshot. Library management and full revision history belong in the document service; do not add duplicate History or Open full library links to the widget. Retain older snapshot selection under Citation options.
- Abstract is the source’s published summary; Description is a shared catalog note. Never copy the abstract into Description. Attachment-specific commentary belongs to the host record/change/event. Use `contextFields(mode)` and `renderAttachmentContext(link)` for the owner’s material editor/summary, preserving its stable scope, publication permissions and provenance through consolidated comparisons; do not invent a competing global comment field in Document-service.
- Optional does not mean unavailable: expose citation keys, personal/institutional authors and editors, type, publication fields, DOI/ISBN/language, abstract, description, source URL and extra bibliography fields through expandable groups.
- Use shared fields, layout primitives, CSS tokens and bilingual copy. Keep repeated instances' IDs unique, long German labels usable and narrow screens free of horizontal overflow.

## Lifecycle and other new targets

The event integration uses `lifecycle_material` links, with constitution ID as target and the saved constitution/provision event ID as scope. Both new event forms use `StagedDocumentPicker`. Catalog's actor-scoped creation receipts make retries safe after an owner succeeds but attaching evidence fails. Keep publisher relationship rights separate from editor/admin library-writing rights.

For unsaved owners use `StagedDocumentPicker`, optionally setting `form` to the owning form's ID when the picker is outside it. Its hidden field carries `{documentId,revision,citationNote?}`. Resolve these references on the server before saving the owner; attach only to the saved exact scope. Library-only uploads are atomic and idempotent via `POST /library/documents`, and remain in the central library if the host is cancelled. Do not switch the mounted composer to an immediate-save adapter after a partial failure.

Wiki image reuse uses the staged adapter's `kind="image"` filter and retains page-owned presentation metadata. Wiki bibliography uses immutable citations and verifies pins at publication. Supplementary import evidence uses private job/proposal/run link targets without modifying captures. Structured references use the `document` target with `documentId`, `documentRevision` and optional `locator`; publication synchronizes them from Content, never from a client-supplied list. Preserve note references through the note editor and popup projections as well as the main reader. Keep legacy URLs compatible.

## Verification

Run gateway focused tests, typecheck, lint/build and both complexity gates appropriate to changed packages. Test file and URL creation with full optional metadata; default minimal appearance; optional sections retaining data; folder search; lazy historical revision selection; read-only roles; failed writes and retry identity; detach behavior; and multiple embedded instances.

Place the component inside a host form and verify the host can save independently when the upload title is empty, its controls have no parent form association, and document actions/Enter do not submit that host. Inspect English/German at desktop and 390px; check keyboard access and axe. Run service tests for DTO, transaction, pin or permission changes. Use the pinned browser for golden comparisons; do not regenerate baselines using a different browser.

To inspect the actual component without backend writes:

```sh
node docs/design/prototype/document-attachment/build.mjs /tmp/document-attachment-preview.html
```

The generated HTML bundles the current shared component and synthetic local callbacks. It performs no uploads. Serve it from a directory containing only that preview when a browser requires HTTP. Rebuild it after component changes; do not maintain a separate imitation of the UI.

Cloud-local URLs are internal QA endpoints, not user-facing preview links. For user review, update the existing private hosted Site documented in `docs/design/prototype/document-attachment/README.md` using the Sites skill, and return its verified HTTPS URL. Preserve the hosting checkout's `.openai/hosting.json` and Site identity.
