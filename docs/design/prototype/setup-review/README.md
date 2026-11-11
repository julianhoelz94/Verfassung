# Shared constitution workspace mock

Private interactive preview: https://constitution-setup-review.sillycurlew.chatgpt.site

One shared layout covers all three consumers of the constitution structure editor:

| Mock page           | Existing route                     | Preserved workflow                                                                                                                                     |
| ------------------- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Create constitution | `/admin/constitutions`             | Native identity validation, presets, hierarchy editing, final creation review, existing-constitution entry points. Documents follow creation.          |
| Existing settings   | `/admin/constitutions/[id]`        | Hierarchy/display editing, impact checking, safe save, migration block, document links and previous settings restored as an unsaved draft.             |
| Import setup review | `/admin/import/setup/[proposalId]` | Submitted identity/source details, display-only adjustments, requests for structural correction, confirmation/resume, withdrawal and proposal history. |

The **Before / Mock** switch compares each page with actual unedited screenshots
of the current app, captured locally using synthetic API fixtures. Desktop 1440px
and mobile 390px captures are included, with direct PNG downloads. The before
images use the original German interface; their source paths and environment are
recorded in `before/captures.json`.

The mock changes no application route and sends no live application commands.
Display edits, files, evidence and correction notes stay in browser memory. Drafts
remain independent across the three page contexts and survive comparison toggles.
The current application files remain unchanged.

## Concrete shared design and behavior

`SharedWorkspace` renders the header, full-width viewer toolbar, left pane,
hierarchy, level editor, reader preview, task panels and sticky tools once.
`workflows.ts` supplies the page context and retains each workflow's state.
`WorkflowPanels` supplies the distinct creation, settings and proposal commands.

The design directly bundles the implemented `SiteHeader`, runtime tokens,
`PageHeader`, fields, buttons, layout primitives, `FullWidthPage`, `PageChrome`,
`ReaderIcon`, measured sticky offsets, `ReaderMenu`, `ConstitutionBasicsFields`,
`OutlineLayerEditor`, `StructureTemplates`, `StructurePreview`, outline model,
`OutlineReviewCard`, `OutlineFeedback` and shared constitutional typography.
The preview clears an inherited grid placement when composing the shared reader
preview in its two-column host; narrow layouts stack fields above the preview.

The canonical `DocumentAttachmentTemplate` and its upload/library picker serve
constitution and setup-proposal evidence. Both contexts share the mock library,
while links, pinned revisions, contextual notes and input drafts stay scoped.
The proposed source metadata is separate. New owners defer document attachment
until creation, matching the existing workflow.

Only Next navigation and unused server-command boundaries are replaced by local
adapters. These three screens are a proposed shared-workspace change, not a new
standalone import editor.

## Build and verification

```sh
node docs/design/prototype/setup-review/build.mjs /tmp/constitution-workspace/index.html
python3 -m http.server 8766 --directory /tmp/constitution-workspace
node docs/design/prototype/setup-review/verify.mjs http://127.0.0.1:8766
apps/gateway-web/node_modules/.bin/tsc --noEmit -p docs/design/prototype/setup-review/tsconfig.json
```

Verification covers 90 views: three pages, five panels, English/German, and
390/700/1440px. Checks include axe, overflow, usable field widths, preview placement,
full-width toolbar/borders, pane toggles, sticky tools, keyboard tabs and all
original screenshot assets. Interactive journeys verify native creation gates,
presets and new levels, safe settings saves and migration blocking, restoration
as a draft, distinct evidence scopes/pins, retained creation/upload/review drafts,
requested changes and confirmation. Artifacts are under
`/workspace/artifacts/setup-review/shared/`.

The separate hosting checkout is `/workspace/sites/constitution-setup-review`.
Preserve its `.openai/hosting.json`, Site identity and private audience. Rebuild its
`index.html` from these sources; `build.mjs` copies it and `before/` into `dist`.
Cloud-local servers are internal QA; use the hosted URL for user review.
