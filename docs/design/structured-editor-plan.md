# Structured constitutional text editor

Status: Proposed implementation plan  
Scope: catalog-service, content-service, editor-service, ingestion-service, and gateway-web  
Tracking: assign Linear issues before implementation; Linear remains the source of truth for delivery status

## Summary

Replace the article-level plain-text editor with one structured editor that operates on the constitution's content tree. The editor presents structural levels such as chapters and articles as lists, while editable text leaves such as sentences appear as inline, lightly colored segments. A discrete **Editing scope** control lets an editor move between the constitution, chapter, article, paragraph, and sentence levels without changing the underlying data or opening a different editor.

The editor must preserve stable content-node identities, allow editors to correct automatically proposed sentence boundaries, support optional sentence titles, and publish a validated content tree instead of flattening an edited article and deleting its children.

> **Constitution configuration change required:** this work necessitates changing how constitutions are configured. The current outline write model describes ordering and public presentation, while `may_hold_text` and `may_hold_children` are inferred from layer position. The structured editor needs the outline to state explicitly which node kinds may contain editable text, which text is sentence-segmented, and whether titles are editable. This configuration change is a prerequisite, not an editor-only enhancement.

## Why the current editor cannot support this safely

The current gateway submits a draft article as `{ articleId, title, body }`. The editor-service stores that article-shaped JSON and, during publication, copies the source tree before calling the content-service article text patch. In `ArticleQueryService.updateText`, a body that differs from the flattened child text causes all children to be deleted and the new body to be stored on the article root.

Consequences:

- Sentence IDs and their titles are lost after a text change.
- The editor cannot show which visible sentence maps to which `content_nodes` row.
- Sentence-level history, predecessor relationships, and review are unavailable.
- A title visibility setting cannot express whether a title may be authored; it only controls public presentation.
- The editor cannot reliably decide whether text at a given outline level is editable because the write configuration does not express that capability.

## Product decisions

### One editor, multiple semantic scopes

Use one tree editor. The scope control changes how much context is visible, not what data model is being edited.

- **Constitution scope:** ordered list of top-level structural nodes with change summaries.
- **Chapter/section scope:** ordered list of the next structural level, such as articles.
- **Article/paragraph scope:** constitutional text with editable leaf nodes rendered inline.
- **Sentence scope:** focus view of one editable leaf, with its parent context and metadata.

The available scope stops come from the configured outline. Do not hard-code that every constitution has chapters, articles, paragraphs, and sentences. A constitution with `article → sentence` exposes Constitution, Article, and Sentence stops; one with `title → chapter → article → clause` exposes its own stops.

The default scope is the first level that gives useful textual context, normally Article. Store the chosen scope and focused node in URL state so reload, back/forward navigation, and shareable staff links behave predictably. The scope is an editor-view preference and must never mutate constitution configuration.

### Structural nodes use lists; editable leaves use text segments

- Nodes that only contain children are shown as compact ordered lists.
- Nodes that may contain text are shown as editable text surfaces.
- Sentence-segmented leaf nodes are rendered as inline colored boxes that still read as continuous prose.
- Color is paired with text/status and never carries meaning by itself.
- The cursor and controls appear only for node properties permitted by configuration.

### Sentence boundaries are structured data

Automatic sentence detection proposes boundaries when unstructured text is imported or pasted. Once accepted, boundaries are stored as nodes. Punctuation does not continuously re-split an already structured tree.

Editors can:

- split the selected sentence at the caret;
- merge it with the previous or next sentence;
- edit sentence text normally;
- override an automatically proposed boundary;
- undo operations within the current draft;
- review added, removed, edited, split, and merged nodes before submission.

### Titles and public display are separate concepts

The current `showTitle` setting answers whether a title appears in public rendering. It must not be reused to decide whether an editor may author a title.

Add a title policy to each node kind:

- `none`: the node must not have a title;
- `optional`: the editor may add or clear a title;
- `required`: the editor must provide a nonblank title.

Sentence titles, when allowed, are edited through a compact chip/inspector associated with the selected sentence. The editor-view control must use explicit copy such as **Show sentence titles in editor** / **Hide sentence titles in editor**. Constitution-wide configuration belongs behind a separately named action such as **Open constitution structure settings**.

## Constitution outline configuration

### Proposed configuration contract

Extend `OutlineKindWrite` and the admin outline form so that an outline layer contains domain capabilities as well as public presentation:

```json
{
  "kindCode": "sentence",
  "displayLabel": "Sentence",
  "mayHoldText": true,
  "segmentation": "sentence",
  "titlePolicy": "optional",
  "presentation": "concatenated",
  "showLabel": false,
  "showTitle": false,
  "showKind": false
}
```

Recommended fields:

| Field | Meaning |
| --- | --- |
| `mayHoldText` | Nodes of this kind may store and edit body text. |
| `mayHoldChildren` | Returned capability derived from allowed-child edges; not independently editable while outlines remain a linear hierarchy. |
| `segmentation` | `none` or `sentence`; controls initial parsing and sentence editing tools. |
| `titlePolicy` | `none`, `optional`, or `required`; controls authoring and validation. |
| `presentation` | Existing public rendering mode: `section` or `concatenated`. |
| `showLabel`, `showTitle`, `showKind` | Existing public presentation flags. |

Do not add a persisted “editing scope” or “box/list” setting. Those are derived UI behavior:

- `mayHoldChildren && !mayHoldText` → structural list;
- `mayHoldText && segmentation == none` → ordinary text editor;
- `mayHoldText && segmentation == sentence` → inline sentence segments.

### Validation rules

Catalog-service is authoritative for outline validation.

1. At least one kind must exist.
2. Kind codes remain unique lowercase slugs.
3. `segmentation == sentence` requires `mayHoldText == true`.
4. A sentence-segmented kind must be a leaf and therefore have no allowed child kinds.
5. A kind with `mayHoldText == false` cannot use text segmentation.
6. A kind with `titlePolicy == none` cannot require or publicly show a stored title. Decide during implementation whether historical public titles require `optional` to be set automatically during migration.
7. A `concatenated` public presentation may still allow editorial titles; `showTitle` remains false unless a separate public design explicitly supports inline titles.
8. Removing a text-holding kind or changing its segmentation requires a preview of affected versions and an explicit restructuring confirmation.

### Database migration

Add a new catalog-service Flyway migration; never modify the applied outline migrations.

- Keep the existing `may_hold_text` and `may_hold_children` columns.
- Add `segmentation TEXT NOT NULL DEFAULT 'none'` with a check constraint.
- Add `title_policy TEXT NOT NULL DEFAULT 'none'` with a check constraint.
- Backfill current deepest `sentence` kinds to `may_hold_text = TRUE`, `may_hold_children = FALSE`, `segmentation = 'sentence'`.
- Backfill existing kinds with stored/public titles to `title_policy = 'optional'`, and top provision kinds whose titles are currently required to `required` where appropriate.
- Preserve public presentation values exactly.

Because each service owns its database, no cross-service foreign keys or direct SQL reads are introduced.

## Canonical content-tree rules

Content-service remains the source of truth for published constitutional text.

For every stored node:

- `kind` must exist in the constitution's catalog outline.
- The parent/child kind combination must be allowed by the outline.
- Only kinds with `mayHoldText` may have a nonblank `body`.
- Sentence-segmented nodes must be leaves.
- A node with children normally has no body; mixed body/children storage is rejected unless explicitly designed later.
- Sort order is unique and contiguous within a parent after normalization.
- `title` follows the configured title policy.
- IDs are opaque UUIDs and stable across ordinary edits.
- Published versions remain immutable in accordance with ADR 0002.

The content-service must validate these rules on every tree write. Frontend validation is for feedback, not authorization or integrity.

## Draft tree contract

### Editor API

Introduce a versioned structured draft payload rather than extending the ambiguous article-body payload:

```json
{
  "formatVersion": 1,
  "articleId": "…",
  "articleTitle": "Human dignity",
  "nodes": [
    {
      "id": "…",
      "kind": "paragraph",
      "label": "1",
      "title": null,
      "children": [
        {
          "id": "…",
          "kind": "sentence",
          "title": "State duty",
          "body": "To respect and protect it shall be the duty of all state authority.",
          "children": []
        }
      ]
    }
  ],
  "operations": [
    {
      "type": "update_text",
      "nodeId": "…"
    }
  ]
}
```

Recommended routes:

- `PUT /edit-sessions/{sessionId}/articles/{articleId}/tree` saves the current structured article draft.
- `GET /edit-sessions/{sessionId}/articles/{articleId}/tree` returns the source tree overlaid with the latest draft plus validation state.
- The existing preview endpoint includes per-node change summaries.

The operation list is audit/review metadata. The complete draft tree is the save and recovery source of truth, so replaying every keystroke is unnecessary.

### Editor database

Use a new Flyway migration in editor-service. Two acceptable storage designs are:

1. Add a versioned tree payload to the existing `draft_changes.payload` and `edit_revisions.snapshot` JSONB records, with a new `change_kind = 'tree_save'`.
2. Add a dedicated latest-draft table while continuing to snapshot into `edit_revisions`.

Prefer option 1 initially because the existing append-only draft/revision mechanism already supports JSONB snapshots and recovery. Add a `formatVersion` discriminator, typed deserialization, and indexes only if measured query behavior requires them. Retain read support for legacy `change_kind = 'save'` sessions until they are published, discarded, or explicitly migrated.

## Identity preservation and reconciliation

### Ordinary edits

Editing the text or title of a node retains its ID. Moving a node within the same parent retains its ID. Reordering changes only sibling order.

### Split

- The first resulting sentence retains the original ID.
- The second receives a new draft UUID.
- The operation records the original ID and new ID.
- The original title stays with the first sentence by default; the second starts untitled unless the editor chooses otherwise.

### Merge

- The earlier sentence retains its ID by default.
- The removed sentence ID is recorded in the merge operation.
- If both sentences have titles, require an explicit choice: keep first, keep second, combine, or edit a replacement.
- The published successor records predecessor provenance for the retained node; richer many-to-one provenance should be added only if amendment requirements demand it.

### Automatic segmentation

Automatic segmentation is used only when:

- importing plain text into a sentence-segmented leaf layer;
- pasting a multi-sentence block into an explicit “paste and segment” action; or
- opening legacy root text that has no structured leaf nodes.

The segmenter may recognize `.`, `!`, and `?`, but must include legal-text protections for abbreviations and citations such as `Art.`, `Abs.`, and common locale-specific forms. Proposed boundaries are shown for confirmation. Manual boundaries are persisted as nodes and are not re-derived from punctuation on every save.

Use the configured language code when selecting segmentation rules. Start with deterministic rules and fixtures; do not make an external AI service part of the correctness path.

## Content-service write path

Add a tree-aware write command, for example:

- `PUT /articles/{articleId}/tree`, accepting article metadata and child nodes; or
- an internal bulk successor-version tree replacement used only by editor-service.

The command must:

1. authenticate the content writer;
2. require a writable draft version;
3. resolve the constitution outline through the existing catalog boundary;
4. validate kind, hierarchy, text, title, IDs, and ordering;
5. update the tree transactionally;
6. preserve IDs for existing draft-version nodes and reject IDs outside the target article/version;
7. return the normalized stored tree.

Do not route structured drafts through `PATCH /articles/{id}`. Keep that endpoint temporarily for nonstructured callers, then deprecate it once ingestion and the editor use tree writes. It must no longer be the publish path for sentence-enabled constitutions.

## Publish flow

The existing two-axis version rules remain unchanged. Structured editing changes only how content is copied and modified.

1. Verify the edit session, workflow status, hop kind, and version-tip constraints as today.
2. Load the source version's complete content tree.
3. Create the successor catalog version.
4. Copy unchanged trees to the successor with predecessor IDs.
5. Apply each structured article draft to the corresponding successor article.
6. Preserve predecessor relationships for retained nodes and create new IDs for added nodes.
7. Validate the entire changed article tree before catalog publication.
8. Publish the version and emit the existing outbox/reindex events.

Any validation failure must leave the successor unpublished and report node-addressable errors to the editor. Where possible, create and populate the successor in one recoverable application transaction sequence; cross-service calls cannot share a database transaction, so publication remains the final visibility boundary.

## Gateway editor implementation

### State model

Build one client component around a normalized tree state:

- nodes keyed by ID;
- ordered child-ID arrays;
- current scope kind and focused node ID;
- selected editable node ID;
- draft operation summary;
- validation issues keyed by node ID;
- view-only preferences such as title-chip visibility.

Do not make `contenteditable` DOM structure the source of truth. Browser selection may be used to determine a caret position, but split/merge/edit commands update the normalized model and rerender it.

### Scope control

Use a discrete semantic range with one stop per configured outline kind, plus Constitution where useful. The visible labels are the outline's `displayLabel` values.

- Moving toward broader scope retains and reveals the ancestors of the selected node.
- Moving toward narrower scope focuses the selected descendant or asks the user to select one.
- Clicking a chapter/article list row advances to the next scope.
- Back/forward navigation restores `scopeKind` and `focusId` from the URL.
- Large scopes load summaries first and detailed descendants on demand.

Do not render or fetch the entire body of a large constitution merely because Constitution scope is selected.

### Editing affordances

- Structural rows use normal pointer behavior and navigation language.
- Editable nodes show a text cursor and selected outline.
- Split is enabled only for a selected sentence-segmented node and a valid caret position.
- Merge is enabled only when an adjacent compatible sibling exists.
- Title controls follow `titlePolicy`.
- The inspector identifies node kind, label/order, draft status, and optionally the opaque node ID under a technical-details disclosure.
- The inspector states when a selected node is structural: for example, “Article is a container; edit its sentence text below.”
- Use **Show/Hide sentence titles in editor** for the view preference.
- Use **Open constitution structure settings** for the configuration route.

### Review display

Preview and review must distinguish:

- text changed;
- title changed;
- node added or removed;
- sentence split or merged;
- node reordered;
- automatically proposed boundary still requiring confirmation.

Reviewers should be able to select a changed item and jump to it at Article or Sentence scope.

## Ingestion and legacy data

Ingestion must submit trees that satisfy the target constitution's outline. Add outline-aware validation before content-service writes.

For existing versions:

- valid trees remain unchanged;
- sentence nodes become editable leaves after configuration backfill;
- root-only article bodies can still be read publicly;
- when first edited, root-only bodies require a one-time segmentation review before a structured draft can be submitted;
- no published version is rewritten in place.

Provide a read-only audit command or admin report that lists:

- bodies stored on kinds that configuration says cannot hold text;
- sentence nodes with children;
- invalid parent/child kind pairs;
- titles violating the new title policy;
- duplicate or noncontiguous sibling ordering;
- root-only text awaiting structure.

Do not automatically rewrite published history. Repairs occur through import correction before publication or through a new editorial correction snapshot.

## Service-by-service implementation sequence

The sequence deliberately establishes server-side contracts before enabling the new editor.

### Phase 0 — Product and tracking setup

- Create/locate the Linear epic and issues for the cross-service work.
- Confirm title policies and whether any constitution needs editable text above the leaf level.
- Confirm supported initial languages for deterministic sentence segmentation.
- Record the configuration decision in an ADR if it is considered an architectural contract; link this plan from that ADR.

Exit condition: configuration fields and invariants are agreed and tracked.

### Phase 1 — Catalog configuration

Owner: catalog-service + gateway admin outline UI.

- Add catalog Flyway migration for segmentation and title policy.
- Extend catalog DTOs and OpenAPI.
- Stop forcing `may_hold_text = TRUE` for every layer; accept and validate the explicit capability.
- Continue deriving `may_hold_children` from allowed-child relationships.
- Add sentence-leaf and title-policy validation.
- Extend constitution creation and outline editing forms.
- Show a destructive-change preview before restructuring existing versions.
- Add catalog API and normalization tests.

Exit condition: the catalog returns a complete, validated editing contract for every outline kind.

### Phase 2 — Content tree validation and writes

Owner: content-service.

- Extend the catalog client model with the new capabilities.
- Add reusable tree validation with node-addressable errors.
- Add the transactional article-tree write endpoint.
- Preserve IDs and enforce version ownership.
- Add legacy-tree audit reporting.
- Add unit/API tests for every invariant and failure mode.

Exit condition: a writable version can safely accept and return a fully structured article tree.

### Phase 3 — Structured editor drafts and publishing

Owner: editor-service.

- Add versioned structured draft DTOs and JSONB persistence.
- Add structured save/read endpoints.
- Compute node-level change summaries against the source tree.
- Update publish to apply tree drafts rather than article body patches.
- Preserve node/predecessor identity according to split/merge rules.
- Continue reading legacy article-body draft sessions.
- Add editor API, workflow, authorization, and publish tests.

Exit condition: a structured draft survives save/reload/review and publishes without flattening the tree.

### Phase 4 — Gateway semantic-zoom editor

Owner: gateway-web.

- Add the normalized tree state and API client types.
- Add structural list views for Constitution/Chapter/Article navigation.
- Add inline segmented text editing and selection.
- Add the discrete scope control derived from the outline.
- Add sentence title chips and inspector editing.
- Add split, merge, undo, paste-and-segment, and validation interactions.
- Add review navigation and change states.
- Replace ambiguous button copy with explicit editor-view/configuration language.
- Add keyboard, screen-reader, responsive, unit, and end-to-end coverage.

Exit condition: staff can complete the full open → edit → review → approve → publish journey using structured nodes.

### Phase 5 — Ingestion and migration rollout

Owner: ingestion-service plus operational rollout.

- Make imports outline-aware.
- Add segmentation preview/confirmation for unstructured source text.
- Run the legacy-tree audit in each environment.
- Resolve invalid draft/unpublished data before enabling strict validation.
- Enable the structured editor per constitution with a feature flag or configuration readiness check.
- Monitor publish failures and search reindex outcomes.
- Remove the feature flag after all configured constitutions pass the audit.

Exit condition: all active constitutions have valid explicit configuration and use structured writes.

### Phase 6 — Compatibility cleanup

- Remove the old article-body editor after no live legacy sessions depend on it.
- Remove editor-service publication through `updateArticle(title, body)`.
- Deprecate or restrict the destructive content-service article text patch.
- Remove superseded DTOs, helpers, and tests.
- Update CODEMAPS and API documentation.

Exit condition: no supported path silently deletes a structured article's child nodes.

## Testing strategy

### Catalog-service

- Configuration round-trip for every new field.
- Sentence segmentation rejected on a nonleaf layer.
- Invalid capability combinations rejected.
- Existing outlines backfill without changing public presentation.
- Restructuring preview accurately counts affected versions/nodes.

### Content-service

- Valid tree create/update and normalized order.
- Stable ID retained for text/title edit.
- Foreign-version and duplicate IDs rejected.
- Sentence children rejected.
- Text on structural kinds rejected.
- Title policy enforced.
- Published version remains immutable.
- Tree write rolls back atomically on validation failure.

### Editor-service

- Structured draft save/read/revision recovery.
- Legacy draft compatibility.
- Split and merge change summaries.
- Successor tree contains correct IDs and predecessor IDs.
- Unchanged articles/nodes copy unchanged.
- Publish never calls the destructive body-patch path for structured content.
- Review/approval/step-up and two-axis tip rules remain enforced.

### Gateway-web

- Scope stops derive from different outline shapes.
- Structural levels render lists; text leaves render editable segments.
- Scope changes retain selection and URL state.
- Split/merge/title editing update the correct node.
- Show/hide titles changes only the editor view.
- Keyboard-only and screen-reader workflows expose selection and validation.
- Pasting plain text produces a confirmable segmentation proposal.
- Large constitution scope does not request every body.

### End-to-end journeys

1. Open a transcription correction on a tree-backed article.
2. Edit sentence text and title without changing its ID.
3. Split one sentence and merge two others.
4. Navigate Constitution → Chapter → Article → Sentence and back.
5. Submit, review, approve, and publish.
6. Verify the public text, stored tree, predecessor links, timeline semantics, and search index.
7. Reopen the published successor and confirm its sentence mapping is stable.

Run the repository-standard checks for every changed service/app. Because delivery is cross-service and multi-file, apply the sprint close-out reviewer, cleanup, verifier, and Linear gates when this work closes its sprint.

## Rollout and compatibility

- Guard the new gateway editor behind a readiness check based on the returned outline configuration, not only a global flag.
- Keep old draft reads during the transition, but prevent creating new legacy drafts once a constitution is enabled.
- Treat unknown `formatVersion` values as unsupported and preserve their data.
- Publish only through validated structured writes for enabled constitutions.
- Log validation failures with correlation ID, session ID, article ID, and node ID, excluding full constitutional text where unnecessary.
- Expose operational counts for legacy drafts, root-only articles, invalid trees, and structured publish failures.
- Roll back the UI flag if necessary; never roll back applied Flyway migrations.

## Risks and mitigations

| Risk | Mitigation |
| --- | --- |
| Automatic segmentation mishandles legal abbreviations. | Use deterministic locale fixtures and require confirmation for newly proposed boundaries. |
| Broad scope loads too much text. | Fetch summaries at broad levels and bodies only for the focused branch. |
| IDs change accidentally during save/publish. | Make identity-preservation tests part of content and editor API contracts. |
| Title visibility is confused with title authoring. | Separate `titlePolicy`, public `showTitle`, and editor view preference in naming and APIs. |
| Configuration change invalidates historical content. | Audit first; never rewrite published versions in place; repair through a new snapshot where needed. |
| Cross-service publish partially succeeds. | Keep catalog publication last, make draft tree writes idempotent, and retain recoverable failure state. |
| Whole-constitution editing increases accidental change scope. | Default to Article, show changed-node counts, and require review of every changed branch. |
| Browser rich-text behavior corrupts structure. | Keep normalized application state authoritative; translate DOM selection into explicit commands. |

## Acceptance criteria

The feature is complete when:

- Constitution configuration explicitly determines where text and titles may be edited.
- A sentence-segmented kind can exist only as a text-holding leaf.
- The editor derives its available scopes and editability from that configuration.
- Chapters and articles appear as lists at broad scopes.
- Sentence text appears as continuous prose with individually selectable segments.
- Editors can split, merge, title, and edit sentences without separate sentence forms.
- Existing node IDs survive ordinary edits; split/merge identity rules are deterministic.
- Draft preview and review identify changes at node level.
- Publishing writes a validated tree and never flattens changed structured articles.
- Public rendering and search remain correct.
- Legacy data has an audited, non-destructive transition path.
- All affected service tests, gateway lint/build, end-to-end journeys, and sprint close-out checks pass.

## Suggested Linear breakdown

Create or map these as separate issues under one epic so each service retains a reviewable boundary:

1. Catalog: explicit text, segmentation, and title-policy outline configuration.
2. Content: outline-aware tree validation and article-tree write API.
3. Editor: structured draft persistence and node-level diff model.
4. Editor: structured successor publication with stable identity.
5. Gateway: semantic scope navigation and structural lists.
6. Gateway: inline sentence editing, titles, split/merge, and accessibility.
7. Ingestion: outline-aware import and segmentation confirmation.
8. Migration: legacy-tree audit, readiness checks, and staged enablement.
9. Cleanup: retire destructive legacy editing paths and update documentation.

Do not mark any issue complete solely because its local UI or API works. Each issue's acceptance tests must include the contracts it owns, and the epic is complete only after the end-to-end publish journey and migration audit succeed.
