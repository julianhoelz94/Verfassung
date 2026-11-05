# Amendment workspace redesign plan

The amendment editor should put the legal change first: one constitution-wide before/after version pair, a public amendment comment, and readable comparisons of the affected passages. A compact menu gives amendment details, documents, history, and publication a clear home. Progressive disclosure reduces the open form without removing editorial tools.

This directory contains the approved interactive local mock. Its instruments and changes are fictional. The production implementation is tracked in [the implementation plan](../../amendment-workspace-implementation.md), including service-backed evidence management and verification.

## Proposed workspace

Open on **Affected passages**, showing one constitution-wide version pair above the amendment comment and the affected-passage list. The pair belongs to the amendment; it is not chosen independently for each article. Use the same warm paper, quiet green accents, serif text, and full-width sticky menu as the viewer and compact editor. Keep navigation hideable, with Previous and Next beside the passage heading. On phones, stack Before above After and let the menu wrap; measure its height so sticky tools and anchor targets remain aligned.

The menu contains Affected passages, Review, Details, Documents, History, Publication, and Save draft. Review has a compact unresolved count. Save draft is the primary editing action. Publication has its own checklist and explicit confirmation, rather than competing with Save at the bottom of the form.

**Recorded changes and detected differences remain separate.** One amendment contains several affected-passage entries. An entry may cover several differences, and a difference may require several entries. Both views share a passage comparison surface, but only Review shows decisions and progress. The mock deliberately has three records and four findings.

## Confirmed data structure

The current backend already follows this model. `AmendmentDto` and `AmendmentRevisionDto` have one `sourceVersionId` and one `targetVersionId`, plus a `changes` collection. The amendment belongs to a single `constitutionId`. In the database, `amendment_revisions` owns the version pair; `amendment_changes.revision_id` associates each affected passage with that revision.

Each passage entry also stores exact before/after references, including snapshot IDs for reproducible quotations. Those references do not define independent constitution transitions. `AmendmentService.validateChangeRefs` checks them against the amendment revision’s source/target pair and rejects a different snapshot or constitution. Added passages have only an after reference; removed passages only a before reference. Drafts can leave the pair incomplete, and a not-yet-published target can be represented by a pending logical reference.

`AmendmentDiffReviewService` compares the two whole-constitution trees and creates review candidates from detected differences. Unchanged articles do not each become a review task. Structural changes, moves, and metadata differences can still require review. No database migration is needed for this presentation change.

Code: [Amendment DTOs](../../../../services/amendment-service/src/main/kotlin/com/constitutionatlas/amendment/api/AmendmentDtos.kt), [reference validation](../../../../services/amendment-service/src/main/kotlin/com/constitutionatlas/amendment/service/AmendmentService.kt), [difference review](../../../../services/amendment-service/src/main/kotlin/com/constitutionatlas/amendment/service/AmendmentDiffReviewService.kt), and [revision schema](../../../../services/amendment-service/src/main/resources/db/migration/V7__amendment_revisions.sql). Verified against the current local implementation.

## Capability placement

| Existing capability | Proposed home | Default visibility |
| --- | --- | --- |
| Title, citation, enacted date, effective date | Details; concise read-only context above the workspace | Context visible; fields on demand |
| Summary and public amendment comment | Summary in Details; amendment comment above all affected passages | Comment always visible |
| Source and target constitution versions, staff/public snapshot distinctions | One Constitution versions section above the affected passages; Choose constitution versions opens the only pair selector | Shared pair always visible |
| Change number, added/changed/removed kind | Active change heading | Visible |
| Exact passage locations, search, article/paragraph/sentence selection | Exact references → Correct passage mapping; locations are constrained to the amendment’s shared pair | Wording visible; correction on demand |
| Exact immutable snapshot links, occurrence/revision identity | Before/After links and Exact references disclosure | Links visible; technical IDs on demand |
| Passage-specific note | Passage note beneath the comparison; distinct from the amendment-level comment | Visible |
| Add/remove change | Add change action; Remove inside Correct passage mapping with confirmation | Add visible; Remove on demand |
| Find affected passages | Uses the already-selected constitution-wide pair; no second pair selector | Visible action |
| Difference navigation, filters, branch/level roll-ups | Review; hideable branch navigation and Filters disclosure | Active finding and progress visible |
| Link to new/existing rows, correct pairing, split/merge ambiguity | Review decision area; use Correct passage mapping for correction | Relevant actions only |
| Exclusion with internal reason and reviewer acknowledgement | Review → Exclude with reason | On demand; never merged into public comments |
| Counts, deeper findings, stale decisions, refresh | Compact Review summary and expanded review navigation | Total and unresolved count visible |
| Upload new or choose existing documents | Documents → Upload new document / Choose existing document. One submission creates the library record and attaches it in the mock | On demand |
| Older source references and pinned document revisions | Documents, distinct from managed attachments | On demand |
| Revision inspection and restore | History; past revision opens the comparison read-only | On demand |
| Publish/withdraw | Publication checklist and explicit command confirmation | On demand |
| Stale quote confirmation and republishing | Contextual warning → Publication | Warning visible when applicable |
| Save result/errors, unavailable content, role limitations | Persistent contextual notices and disabled controls with explanations | When relevant |

## Shared implementation

The mock imports these actual gateway sources; it does not copy their markup or palette:

- `WorkspacePage` provides the page template and main landmark.
- `PageChromeSurface`, `PageBreadcrumbs`, `PageMenuFrame`, `PageMenuBar`, and `PageContentsLayout/Navigation/Body` provide the sticky menu and optional navigation used by the viewer and directories.
- `PageHeader`, `Button`, `Badge`, `Input`, `Select`, `TextArea`, and `Alert` provide shared controls and status presentation.
- `Stack`, `Inline`, `Grid`, and `Section` own layout gaps.
- `ConstitutionDocument`, runtime `tokens.css`, and the shared `text-diff` functions render the passage comparison.

`DocumentManagerTemplate.tsx` is the proposed shared document template used by both the amendment and constitution-editor mock contexts. It reuses the actual gateway fields, buttons, alerts, and layout primitives. Both contexts use one sample central library, with separate attachment lists keyed by document ID. Uploading or adding a source URL creates the sample record and attachment in one action; choosing an existing record creates only a link. Switching contexts or opening Documents retains unsaved comments and text.

Local CSS owns only amendment-specific composition and the clearly separated mock controls. The production implementation should extract a small `PassageComparison` component shared by the amendment record and review queue, and an `AmendmentWorkspace` composition for the new/existing routes. Generalize a shared menu control only if the reader/editor consumers can use the same interface; do not introduce an unrelated universal workspace template.

## Implementation sequence

1. **Extract presentation.** Introduce `AmendmentWorkspace` around the existing route loading and permission checks. Adopt the shared menu and optional navigation. Add no service or schema changes.
2. **Establish the amendment scope.** Show the shared constitution version pair and public amendment comment above all affected passages. Choose versions once, compare the whole constitution, and list the resulting affected passages. Unchanged articles require no individual review decision. Keep manual mapping correction under exact-reference details; it selects locations within the shared pair, never independent versions. Then move secondary fields into task views. Retain form names, required fields, values, validation, and unsaved changes across view switches. Route errors to the appropriate view, focus the invalid field, and retain success messages. New records open on Details until the required context is present; existing records open on Affected passages. Support direct links and browser Back for task views and selected changes.
3. **Unify passage display.** Share comparison rendering between `AmendmentChangesTable` and `DiffReviewQueue`; preserve selection/search, exact immutable references, IDs, rich source text, ordering, and empty before/after sides. Keep authored/legal wording read-only in amendment record editing.
4. **Reconnect review and evidence.** Reuse the current review decision actions and model, `DocumentLinks`, revision APIs, and quote-review controls. Preserve multi-row/multi-ref decisions, ambiguity acknowledgement, exclusion reasons, bounded comparison, refreshed denominators, and save/reopen position. Retain production authorization; the visual role selector exists only in the mock.
5. **Finish publication and responsive behavior.** Keep save, review, publication, withdrawal, and quote republishing separate. Scope document attachments and restore operations to the correct draft revision. Apply the existing shared templates to new and existing amendment screens, then remove superseded amendment layout/CSS.
6. **Verify against contracts.** Exercise national/regional/historical records, empty/new drafts, all amendment kinds, long labels, unavailable services, unpinned snapshots, read-only roles, published/withdrawn records, stale quotes, split/merge ambiguity, and large review queues. Check EN/DE at 320/390/820/1440px, keyboard focus, dialogs, sticky tools at the bottom, and source links. Run gateway lint/build and the relevant unit/browser and real-stack editorial journeys. Saving or restoring must never publish; viewing must never write.

## Mock interactions and limits

Open `mock.html` directly in a browser. It is self-contained and makes no API calls. The top strip changes editor context, language, role, and scenario; it belongs to the prototype, not the proposed product.

The prototype demonstrates task switching, hideable change navigation, before/after comparison, constitution-wide version selection, passage mapping correction, amendment comments, passage notes, suggestion append, add/remove records, one-step document upload-and-attach, source-URL record creation, existing-library selection, cross-editor reuse, detach, read-only history inspection/restore, review filters, linking, reasoned exclusion, reviewer acknowledgement, draft saving/reopening in browser storage, and gated publication/withdrawal. Save persists only to this browser. Reset restores the fictional data.

Document uploads retain sample metadata and filenames only; no file bytes are sent to a service or stored. The reference popup, document record inspector, revision bodies, refresh, and passage picker use illustrative local data. The constitution-editor context is a focused document-workflow preview, not a replacement for the complete continuous editor. It is not a complete Catalog/document browser or diff engine. Multi-row split/merge decisions, deeper-finding recalculation, rich-text/footnote fixtures, network errors, server-side concurrency, and service-backed commands remain implementation acceptance work. No current backend behavior can be inferred from the mock.

The existing requirements are recorded in [VER-206](https://linear.app/verfassung/issue/VER-206), [VER-232](https://linear.app/verfassung/issue/VER-232), and [VER-241](https://linear.app/verfassung/issue/VER-241), all Done when checked on 4 November 2026. This proposal preserves those capabilities; it does not reopen those issues or claim new production delivery.

## Build and inspect

From the repository root, with gateway dependencies installed:

```sh
node docs/design/prototype/amendment-workspace/build.mjs
node docs/design/prototype/amendment-workspace/verify.mjs /private/tmp/amendment-workspace-check
```

The build bundles actual shared React components, CSS Modules, and runtime tokens into `mock.html`. All prototype source stays under `docs/`, outside Next.js page discovery and the gateway deployment context. The mock creates no deployed route and modifies no shared production component.

## Approved implementation

This prototype was approved for implementation on 4 November 2026. The implementation plan and verification record are in [amendment-workspace-implementation.md](../../amendment-workspace-implementation.md). The prototype remains a self-contained sample-data reference outside deployment compilation. Production uses its own shared DocumentManagerTemplate with real authorization and service-backed commands.
