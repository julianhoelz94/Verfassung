# Constitution setup review mock

Private interactive preview: https://constitution-setup-review.sillycurlew.chatgpt.site

This is a design suggestion for `/admin/import/setup/[proposalId]`, based on main
at `d3cf706`. It does not change that route or send application commands. Files,
display edits, evidence links and review notes remain in browser memory.

The proposal uses the implemented editorial design: the same site header with
Imports selected, an edge-to-edge viewer toolbar, its standard lower border,
the established contents icon on the left, and no extra header separator.
The sidebar describes the proposal and its hierarchy; task tabs are not repeated.
Five views separate proposal details, structure/display, documents, review and
history. Confirmation creates setup only; text import and publication stay separate.

## Concrete reuse

- Actual `SiteHeader`, runtime tokens, shared `PageHeader`, fields, buttons,
  status surfaces and layout primitives.
- Actual `FullWidthPage`, `PageChromeSurface`, `PageMenuFrame`, `PageMenuBar`,
  `PageContentsLayout` and measured sticky offsets. Menu controls compose the
  viewer's CSS rather than imitating its spacing or icons.
- Actual `OutlineLayerEditor`, outline model, `StructurePreview` and
  `OutlineReaderPreview`/`ConstitutionDocument`. Structural editing is disabled;
  display edits update the preview. Structural corrections go through a request.
- Actual `DocumentAttachmentTemplate` and its canonical library/upload controls,
  with a small browser-local adapter for a single `setup_proposal`. Citation notes
  stay on each link; older revisions remain explicitly pinned. Detach keeps the
  document in the simulated library. Proposed source details remain separate.

The build substitutes only the Next navigation boundary and server commands that
must not run in a static mock. Shared UI source is bundled directly from the app.
The demo ribbon switches English/German and proposed, changes-requested,
interrupted-confirmation, confirmed and withdrawn states. Reset clears local data.

## Build and inspect

```sh
node docs/design/prototype/setup-review/build.mjs /tmp/constitution-setup-review/index.html
python3 -m http.server 8766 --directory /tmp/constitution-setup-review
node docs/design/prototype/setup-review/verify.mjs http://127.0.0.1:8766
apps/gateway-web/node_modules/.bin/tsc --noEmit -p docs/design/prototype/setup-review/tsconfig.json
```

Localhost is internal QA, not the user-facing preview. The separate Sites checkout
is `/workspace/sites/constitution-setup-review`; retain its `.openai/hosting.json`
and Site identity when updating it. Rebuild that checkout's `index.html` from these
sources and run its `build.mjs` to populate `dist` before private publication.

Browser verification covers 390, 700 and 1440px in English/German, all five views,
axe, overflow, pane toggling, keyboard tabs, sticky tools near the page bottom,
live display changes, pinned evidence with scoped notes, draft preservation,
request changes and confirmation. Screenshots and measurements are written to
`/workspace/artifacts/setup-review/`.
