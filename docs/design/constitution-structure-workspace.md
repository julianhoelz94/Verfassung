# Constitution structure workspace

The shared workspace serves constitution creation, existing settings and import setup approval. It replaces simultaneous forms for every kind with hierarchy navigation, one selected kind, Structure / Editing / Display fields and a shared reader preview. Workflow hosts retain their authorization, identity/source loading and commands.

## Acceptance requirements

- Preserve all structure, editing and display settings, literal identifiers and configured kind names. Explain settings with the existing information controls. Keep technical identity expanded when opening its help.
- Derive hierarchy from actual root and child permissions. Permit multiple paths and skipped levels. Context menus support child creation, insertion on one named edge, additional roots, attaching an existing kind and removal. Keyboard and visible menu buttons provide the same actions as right-click.
- Flag disconnected kinds in orange, explain repairs on hover/focus/touch and reject saves until every kind is reachable from a root. Reject cycles as well. Catalog remains authoritative.
- Use shallow shared indentation. Each child guide starts horizontally at its parent's text start. Keep running siblings joined and distinguish them from a parent's own prose.
- Provide five editable, data-driven starting structures inspired by Germany, France, India, South Africa and Spain, with official structural references. These create settings, never constitutional wording.
- Provide an illustrative preview that covers every configured kind and allowed path. Keep imported source samples separately selectable and preserve their literal content. Preview metadata explains the kind name, number/identifier and heading separately.
- Preserve impact checks and stale-revision/migration gates for existing settings. History prepares a draft before another impact check. Documents retain the shared upload/library manager. Creation can link documents after the owning constitution exists.
- Import hierarchy and editing rules remain read-only; presentation can be adjusted while proposed. Retain original/revised proposal comparison, source/identity, recorded feedback, confirmation, withdrawal and interrupted-confirmation recovery. Confirmation does not import or publish text.
- Viewer and editor preview share persisted reading preferences: indentation and hierarchy guides. Show the guide toggle only while indentation is on; retain its previous choice while hidden. The active editor has independent view preferences using the same controls. Display changes must preserve selection, caret, undo and source data.

## Verification

Check graph updates and rejection without writes, all five preset graphs, metadata visibility independent of numbering, exact text/mark/table preservation, read-only import payloads, impact/stale gates, history-to-draft behavior, browser preference restoration and absence of draft operations from display changes. Inspect the running application in English and German at desktop and narrow widths, including contextual tools, native disclosures and keyboard/touch help. Run gateway unit tests, typecheck, lint, build and focused browser journeys.
