# Constitution structure workspace

The shared workspace serves constitution creation, existing settings and import setup approval. All three routes use the approved Details / Structure / Documents / Review / History workspace, hierarchy navigation, one selected kind, Display / Structure / Editing fields and a shared reader preview. Workflow hosts retain their authorization, identity/source loading and commands.

## Shared implementation and workflow boundaries

| Route | Owner and commands |
| --- | --- |
| `/admin/constitutions` | `OutlineEditor`: native country/title/slug validation, presets, complete graph editing, final review and explicit creation. Existing constitutions remain accessible under Details. |
| `/admin/constitutions/[id]` | `OutlineEditor`: current structure/display, Catalog impact check, revision/migration gates, previous settings restored as a draft, constitution-owned document links. |
| `/admin/import/setup/[proposalId]` | `SetupProposalReview`: submitted identity/source, display-only changes while proposed, structural correction requests, exact prior/current comparison, confirmation/withdrawal and frozen-revision recovery. Private proposal-owned document links remain independent of submitted source metadata. |

`StructureWorkspaceFrame` (re-exported as `StructureWorkspaceTemplate`) composes `FullWidthPage`, measured `PageChrome`, a full-width viewer-style toolbar, the standard left overview toggle, the five keyboard-accessible tabs, one contextual hierarchy and the selected constitution header. The heading has no extra separator; the standard toolbar bottom border remains. Routes supply their server-loaded header, notices and identity without nesting another page template or `main`.

`OutlineWorkspace` supplies hierarchy and selected-level content through slots. It owns selection, contextual menus and graph editing once; both command owners use it. `OutlineEditorPanels` provides the creation/settings panels without duplicating commands. `ConstitutionIdentity` shares read-only facts; `StructureOverview` projects actual allowed paths and opens the editor without losing the draft. Proposal Details retains the literal submitted sample and separates its source metadata from supplementary evidence. The reader preview remains the shared legal renderer. Fields and preview use two columns on wide screens and stack below 1024px; phones use the same overview toggle and a compact contents pane.

The native owner form and all task panels stay mounted during tab or pane changes. Documents are mounted outside the owner form, using `DocumentLinks` and the canonical shared attachment template; file/title/metadata and revision pins therefore survive task switching without joining native owner validation. Creation waits for a saved constitution before offering live attachments. Proposal reasons and unsaved display changes survive navigation within the workspace. No mock page selector, comparison controls or simulated commands ship in the application.

Entering creation Review validates native basics and the complete outline; only the reviewed explicit Create button writes. Existing settings require a successful check against the current revision and current draft. Edits or history restoration invalidate an in-flight check as well as completed results; the server still preflights and enforces revision/migration gates before writing. History never directly saves restored settings.

The accepted reference, including actual before screenshots, is [the interactive mock](prototype/setup-review/README.md). Runtime verification and screenshots are recorded in [the implementation review](verification/constitution-workspace/README.md).

## Acceptance requirements

- Preserve all structure, editing and display settings, literal identifiers and configured kind names. Explain settings with the existing information controls. Keep technical identity expanded when opening its help.
- Derive hierarchy from actual root and child permissions. Permit multiple paths and skipped levels. Context menus support child creation, insertion on one named edge, additional roots, attaching an existing kind and removal. Keyboard and visible menu buttons provide the same actions as right-click.
- Flag disconnected kinds in orange, explain repairs on hover/focus/touch and reject saves until every kind is reachable from a root. Reject cycles as well. Catalog remains authoritative.
- Keep task navigation below the measured site header at desktop and mobile widths. Use shallow shared indentation. Each child guide starts horizontally at its parent's text start. Keep running siblings joined and distinguish them from a parent's own prose.
- Provide five editable, data-driven starting structures inspired by Germany, France, India, South Africa and Spain, with official structural references. These create settings, never constitutional wording.
- Provide an illustrative preview that covers every configured kind and allowed path. Keep imported source samples separately selectable and preserve their literal content. Preview metadata explains the kind name, number/identifier and heading separately.
- Preserve impact checks and stale-revision/migration gates for existing settings. History prepares a draft before another impact check. Documents retain the shared upload/library manager. Creation can link documents after the owning constitution exists.
- Import hierarchy and editing rules remain read-only; presentation can be adjusted while proposed. Retain original/revised proposal comparison, source/identity, recorded feedback, confirmation, withdrawal and interrupted-confirmation recovery. Confirmation does not import or publish text.
- Viewer and editor preview share persisted reading preferences: indentation and hierarchy guides. Show the guide toggle only while indentation is on; retain its previous choice while hidden. The active editor has independent view preferences using the same controls. Display changes must preserve selection, caret, undo and source data.

## Verification

Check graph updates and rejection without writes, all five preset graphs, metadata visibility independent of numbering, exact text/mark/table preservation, read-only import payloads, impact/stale gates, history-to-draft behavior, browser preference restoration and absence of draft operations from display changes. Inspect the running application in English and German at desktop and narrow widths, including contextual tools, native disclosures and keyboard/touch help. Run gateway unit tests, typecheck, lint, build and focused browser journeys.
