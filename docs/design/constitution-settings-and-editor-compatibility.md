# Constitution settings and editor compatibility

Status: proposed product and data contract, 2026-09-21. This document describes the target design; the **current implementation** is called out separately. Delivery is tracked in Linear under the [mixed-content plan](https://linear.app/verfassung/document/mixed-content-constitution-structure-creation-and-editor-394a359fa467) and Sprints 40–43.

The [editor mock](https://chatgpt.com/s/cx_6aad64933310819197bb10b87020c067#message-10) and [creation mock](https://chatgpt.com/s/cx_6ab19261a23c81918eaee43e709a235e#message-16) guide layout and interactions. Their leaf-only controls are superseded by the approved ordered mixed-content model.

## Scope and meaning of change

A **constitution setting** describes the identity, structure, editing rules, or public presentation shared by its versions. A version's legal label, effective date, language, source, verification, legal/editorial predecessor, and publication status belong to that **version**. Article/node labels, titles, and ordered text belong to **content**. Change-record documents and dates belong to **amendment-service**. Country name and ISO code belong to the **country**. The settings menu may link to these records, but must not turn them into constitution-wide values.

Here, **reversible** means a prior setting revision can be restored without deleting content, changing node identity, or altering the meaning of a published snapshot. **Irreversible** means a simple settings revert cannot restore the earlier content/URL interpretation; it needs an explicit migration or successor snapshot. Backups do not make a product action reversible.

The boundary is the **first published version**. Before that point, draft-only structural adjustments may be freely undone. After it, published content and the structural rules used to validate it must stay stable. Catalog should retain settings revisions and pin each published version to its **structural/editing** revision. Reader presentation can be a separately revisioned, reversible site-wide overlay so a later display change can take effect immediately without rewriting content. Preserve its history and offer a preview/revert. The settings UI must show whether a change affects future versions, a current draft, or the live presentation of existing public pages.

## What exists today

| Owner | Stored data | Current settings surface |
| --- | --- | --- |
| Catalog | Country ID, constitution UUID/country/slug/title; version metadata and two-axis chain; ordered outline kinds and edges | Creation form accepts country, slug, title, outline. Later admin page edits only the outline. |
| Catalog outline | `kindCode`, `displayLabel`, position, `mayHoldText`, `mayHoldChildren`, child edge, `presentation`, `showLabel`, `showTitle`, `showKind` | Position derives children; repository currently stores `mayHoldText=true` for every kind. No title-authoring or label-placement policy. |
| Content | `content_nodes`: version, kind, parent, literal label/number, title, body, sibling order, predecessor | `body` and `children` are separate. An article body edit may delete descendants. |
| Gateway | Public renderer and admin outline form | It treats concatenated layers as untitled and hides their labels; it has no mixed-content placement control. |

The existing settings save sequence updates catalog first, then asks content-service to restructure every version. Published versions reject writes, so this can leave a changed catalog outline with old published trees. Replace that sequence with a read-only impact analysis and a versioned, validated settings command; never restructure published versions in place. The planned shared-revision storage still presents each version as an immutable logical snapshot rooted at version-specific references.

## Settings menu

Show the same field definitions in **Create constitution** and **Constitution settings**. Group by the decision an administrator is making:

1. **Identity and links:** country, public title, slug, proposed short citation title, proposed description.
2. **Structure:** ordered levels, level names, generated technical kind codes under Advanced, and the next-level relationship derived from order.
3. **Text and editing:** “Allow text alongside child units” on each non-final level (off by default); final-level text style/segmentation; title and literal-label authoring policies.
4. **Reader display:** separate section or running text where semantically valid; show level name/title; literal-label placement (hidden/heading, plus inline/superscript for text-bearing leaves). Preview the exact same ordered sample in the structure map and shared reader.
5. **Change history:** current settings revision, affected draft/published versions, reversible changes, migration-required changes, and a diff/impact preview.

Do not offer raw `mayHoldText` or `mayHoldChildren` toggles. Derive `mayHoldChildren` from position and `mayHoldText` from final-level status or the parent-text setting. The selected **editor view scope** and whether an individual editor shows title chips are user/URL preferences, not constitution settings.

### Creation-only decisions

| Decision | Rule |
| --- | --- |
| Constitution UUID | System-assigned permanent identity; never an editable field. |
| Country association | Chosen at creation. A mistake discovered after publication is an exceptional audited relocation with URL aliases and cross-service reference checks, not a normal settings toggle. |
| Initial template | Chosen during creation only as a starting point. The resulting level settings remain editable under the rules below; template identity does not constrain them. |

The slug and public title are entered at creation, but should also have controlled later correction paths. The slug is classified below as migration-required because existing links may use it.

### Later changes that are reversible

| Setting | Conditions for safe reversal |
| --- | --- |
| Public title, proposed short citation title, proposed description | Keep revision history; changing text must not change constitution UUID or legal version identity. Preserve prior public names for citation/audit where needed. |
| Level display name and public `showKind`/`showTitle` | Keep stable `kindCode`; revision the live reader overlay and allow revert. A hidden title remains stored and editable according to its separate authoring policy. Historical content keeps its pinned structural rules. |
| Literal-label placement and visibility | Never generate or rewrite a node's literal label. Preview heading/inline/superscript and preserve reading order and accessible names. |
| Reader layout | Allow section/running-text changes only when the renderer can preserve content order, headings, and accessible grouping. Preview and revision the live presentation; keep a way to inspect the previous rendering. |
| Enable parent text on a non-final level | Adds permission; existing entries stay untouched. Disabling is reversible only while no node of that kind contains an own-text entry. |
| Relax title or label authoring (`none → optional`, `required → optional`) | No stored value is discarded. Tightening a policy is reversible only when every affected node already satisfies it. |
| Default language/segmentation rules for **future input** | Proposed setting. Existing version language codes and accepted sentence boundaries are unchanged. Segmenter rules propose boundaries; they never rewrite stored nodes. |

Use `none | optional | required` for **title policy** and, separately, for **literal-label policy**. These control what the editor accepts. Public visibility controls only rendering. An admin may hide a label without deleting it. If labels are optional, unlabeled units remain editable. Required title/label validation should identify the affected nodes before a setting can be saved.

### Later changes requiring migration or a new successor

| Change | Why a toggle/revert is insufficient | Safe path |
| --- | --- | --- |
| Change slug | Existing permalinks and citations may use it. | Reserve prior slug as a permanent redirect/alias; check collision before changing. |
| Rename an existing `kindCode`, change the root kind, add/remove/reorder an occupied level | Stored node kinds, parents, IDs, ordering, permalinks, search, and amendment references may change. | Preview every affected version; map old to new kinds; create new draft/successor content and preserve lineage. Published snapshots keep their pinned outline. |
| Disable parent text when own-text entries exist; remove a text-bearing level | Text needs an explicit destination and position among children. | Require an editor-reviewed relocation in a successor; never join or drop text automatically. |
| Convert already stored freeform text to sentence nodes, or merge existing sentence nodes | Boundary, title, ID, and predecessor choices are editorial decisions. | Propose a transformation in the structured editor and publish a reviewed successor. |
| Forbid already stored titles/labels or require missing ones | Existing content would fail the new rule. | Show violations, resolve them in drafts, then activate the stricter policy for future versions. |
| Change a published version's legal label, effective date, language, source, verification, chain, or text | These are version facts, not constitution settings; published snapshots are immutable. | Follow the relevant version/change-record workflow and create the appropriate editorial or legal successor. |

Adding an **unused** level to a constitution with no content at that depth can be draft-reversible. Once content uses it, the migration rules apply. Settings should classify the actual proposed change after an impact scan, rather than labeling every structural click permanently destructive.

## Ordered content and configuration validation

The planned content API gives each node one ordered `content` sequence containing text entries and child-node entries. A parent's own text can appear before, between, or after children only when its level permits it. Parent text is unnumbered text belonging to that parent. A numbered/titled sentence is an explicit child node. The final level always holds text and has no children.

For storage, separate stable logical unit identity, immutable node/text revision identity, and version-specific occurrence or URL identity. An edit creates a new text revision and ancestor path; unaffected branches may be shared by multiple versions. Content-service resolves all reads and writes from a version's roots. Existing article/node URLs and predecessor links retain their historical meaning. A parent text entry can be selected independently for an amendment link; its source or target version determines which occurrence is cited. This contract is tracked by ARCH-9 in Sprint 40 and the [exact amendment-link plan](https://linear.app/verfassung/document/exact-constitutional-node-links-in-change-records-implementation-plan-026a9660a9f2) in Sprint 44.

Before allowing **any** configuration to be saved, validate:

- At least one ordered level; unique stable kind codes; exactly the configured next-kind relationship; no cycle.
- A usable top-level unit and a text-capable final level. Any name is valid; do not require the literal code `article`.
- Parent text only where opted in; each child occurs exactly once in its parent's resolved sequence; position/order is unique. Shared immutable revisions may be reachable from several versions of the same constitution, but no reference may escape its constitution or resolve outside the selected version's roots.
- A sentence-segmented final level has no child kind. Segmentation is explicit, not inferred from the code `sentence`; parent text is never silently sentence-segmented.
- Title and label policies are satisfiable for all affected draft nodes. Public display options do not remove data.
- The shared reader can render the combination of layout and label placement; unsupported combinations are disabled with an explanation.
- A revision switch cannot make an existing published or open draft tree unreadable. Published versions retain their pinned revision; drafts either stay pinned until reviewed or receive an explicit migration preview.

The UI should show a specific error at the affected level/node and a before/after reader preview. A raw `400` after saving is not sufficient.

## Can every valid configuration be edited?

**Current answer: no.** The present editor accepts one article title/body; the content writer forces root kind `article`; the editor page currently chooses the first country; and body writes can flatten descendants. The earlier structured-editor proposal resolves part of this, but generic roots and configuration revisions must also be in scope.

**Target guarantee:** every configuration accepted by the creation/settings validator has a matching editor operation and reader representation.

| Valid configuration | Required editor behavior |
| --- | --- |
| One arbitrary root level holding text | Select and edit root text; no Article-specific assumption. |
| Any linear hierarchy, including Part → Chapter → Article or Chapter → Clause | Navigate all configured levels; edit the text-capable final node and any opted-in parent text. Scope labels derive from the outline. |
| Parent text before/between/after children | Show ordered insertion points and editable parent runs; preserve order through draft, review, publish, reader, import, and search. |
| Final level with sentence segmentation | Render colored sentence boxes; split/merge only compatible adjacent sentence nodes; preserve manual boundaries and optional titles. |
| Final level without sentence segmentation | Provide a normal structured text run editor; no sentence controls are required. |
| Title/label policy none, optional, or required | Expose only allowed fields; validate required values; allow literal labels such as `46a`, `(2a)`, and `bis`. |
| Hidden, heading, inline, or superscript labels; public titles on/off | Editing remains identical; only reader presentation changes. |
| Mixed legacy versions and a new outline revision | Open with the version's pinned rules or a migration proposal. Never auto-flatten or reinterpret published content. |

To deliver that guarantee, extend Sprints 40–43 with these explicit prerequisites:

1. Generalize content read/write APIs and gateway routes from an Article-only root to an **outline-defined top-level unit**. Preserve existing article URLs as aliases or specialized views where the top level is an article. Do not require every constitution to contain an `article` kind.
2. Select country and constitution explicitly in the editor; never derive the working constitution from the first country returned.
3. Make draft/read/write validation use the same version-pinned outline. Changing a setting mid-session must not silently change what an open draft means.
4. Implement generic text-run editing for leaves without sentence segmentation and parent own-text runs, alongside the sentence canvas.
5. Replace the catalog-update-then-restructure loop with preflight, revision creation, and reviewed content migration. The old loop must not target published versions.
6. Add contract tests over a matrix: article-only; paragraph/sentence; parts/chapters/articles; custom root codes; mixed parent text; optional/required/hidden labels and titles; published historical revisions.

If a combination lacks an editor or renderer implementation, the settings validator must refuse to create it until support exists. This is the release gate that makes “however I configure it, I can still edit it” true.

## Additional settings worth considering

These are proposals, not current fields:

1. **Short citation title and description** for compact navigation and search results (reversible metadata).
2. **Label requirement per level** independently of label placement, with literal manual labels and no automatic legal renumbering (reversible when existing nodes comply).
3. **Title policy per level** (`none | optional | required`) independently of public display (reversible when existing nodes comply).
4. **Text segmentation mode on the final level** (`plain | sentence-assisted`), used only to propose boundaries on new unstructured input (changing existing structure requires review).
5. **Default language for new versions**, while each version retains its own immutable language code and segmentation locale (reversible future-only default).
6. **Source and citation guidance** shown during import and publication, with actual citations/provenance stored per version or source record (reversible help text, never a replacement for source data).

Per-editor scope, title-chip visibility, and accessibility preferences should remain personal view settings. Legal-version labels, effective dates, source URLs, verification, and change-record metadata stay in their respective workflows.

## Implementation references

- Catalog schema and writes: `services/catalog-service/src/main/resources/db/migration/`, `CatalogDtos.kt`, `CatalogWriteService.kt`, `CatalogRepository.kt`.
- Content schema/write path: `services/content-service/src/main/resources/db/migration/`, `ArticleQueryService.kt`, `ContentDtos.kt`.
- Existing admin and editor: `apps/gateway-web/app/admin/constitutions/`, `apps/gateway-web/app/editor/`, `apps/gateway-web/lib/outline.ts`.
- Ownership and immutability: [architecture map](../CODEMAPS/architecture.md), [ADR 0002](../adr/0002-immutable-published-versions.md), [ADR 0005](../adr/0005-two-axis-versions.md).
