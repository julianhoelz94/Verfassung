# Sprint 63 — Reusable UI templates and vanilla CSS

Status: implementation and pinned browser verification complete; final review, required CI, merge and Wiki publication gates are pending. [PR #148](https://github.com/julianhoelz94/Verfassung/pull/148). Linear milestone: `0c315d76-26bb-449a-b211-8bf8aa4a2fc2` in the Verfassung project. Individual issue creation was rejected by Linear's workspace free issue limit; no issue identifier exists and unrelated issues remain untouched. Final merge/publication evidence is recorded in that milestone.

## Delivery scope

1. Consolidate runtime tokens and define spacing ownership. A parent layout owns sibling gaps; a surface owns internal padding; a field owns label/control/help/error spacing.
2. Add typed `Stack`, `Inline`, `Grid`, and `Section` components, explicit page widths, and scoped vanilla CSS Modules.
3. Deliver `FocusedPage`, `SettingsPage`, `CollectionPage`, `ReaderPage`, and `WorkspacePage` templates. Templates compose existing server/client content without fetching data or owning server actions.
4. Pilot account, setup, and site settings. Migrate the remaining route families and remove superseded layout CSS as each owner moves.
5. Extend shared fields with accessible help/error associations. Preserve native controls, translations, authored legal text, API ownership, authorization and publication workflows.
6. Verify English/German at 390, 820, and 1440px and reflow at 320px; inspect Linux screenshot changes, exercise conditional/error/dense states, and update developer documentation.
   Alignment is an explicit acceptance criterion: consistent content edges, aligned label/control tracks under wrapped labels, equal-height card rows, aligned header actions and wrapping button rows.
7. Run independent reviewer and verifier correction loops on the full diff, pass required CI, merge, and verify the post-merge Wiki publication and editorial clips before recording completion.

## Verification

Gateway checks: `npm test`, `npm run typecheck`, `npm run lint`, `npm run build`, and `npm run test:e2e`. Existing route inventory, axe audits, visual snapshots and real-stack CI remain the verification baseline. Screenshot updates require inspection of changes. Completion evidence will be recorded here and in the Linear milestone.

## Delivered structure and alignment

Every rendered page uses a focused, settings, collection, reader or workspace template. Redirect entry points retain their destination. Runtime tokens have one source; scoped CSS owns page widths, headers, surfaces, fields and responsive layouts. Base CSS remains in a lower cascade layer; typography defaults retain the larger hero/MFA and serif legal-editor variants. The template guide documents the contract and both prototype preview instructions serve the repository root so the shared token import resolves.

Shared layout parents own sibling gaps, surfaces own padding, and fields group labels, controls and associated help/errors. Settings navigation/content columns, responsive editor panels, the desktop amendment revision sidebar, stretching card rows, wrapping form actions and shared form-grid tracks have explicit alignment rules. The existing public/preview legal renderer remains the content owner.

The duplicate/superseded-code scan removed old page widths, generic stack/action/card-grid rules, repeated reader/workspace/settings grid definitions, competing form/card spacing and stale direct-child selectors. Review corrections supplied missing gap owners in outline/passkey/card bodies, restored the amendment sidebar and centered history introduction, preserved global button-link alignment, and checked typography precedence. Temporary CI capture tooling is removed from the delivered tree.

## Verification evidence

- Gateway Node 20: 42 Vitest files / 221 tests plus 9 Node tests passed. Host Node 24 exposes an existing Request/AbortSignal test incompatibility; CI's Node 20 verification passes.
- Typecheck, lint and production build passed; the independent verifier also ran focused field/axe/editor/diff-review checks and a separate lint/build. Wiki references, repository hygiene and whitespace checks passed. An HTTP preview check resolved the prototype, its CSS and both token import paths successfully.
- [Pinned Playwright capture](https://github.com/julianhoelz94/Verfassung/actions/runs/39442062602) passed all 12 cases on `b32d140`. It includes the complete route/state gallery, keyboard/reflow checks, original visual journeys and the new EN/DE template checks.
- The route audit renders 45 entry points plus nine task variants in both languages at 390/820/1440px, with axe at phone/desktop widths and narrow reflow checks at 320px. New measurements verify shared settings gaps and content edges, long-label form-control alignment, outline/passkey field gaps and global action-link alignment. Computed styles verify hero, legal-editor and MFA typography.
- The captured set contains 207 Linux baselines; 155 changed. Before/after comparisons and route-gallery sheets were inspected for reader, account, setup/site settings, outlines, amendment/sidebar, active editor, search, documents and history layouts, including German mobile wrapping. Baseline acceptance and final required CI are separate gates.
- Developer Wiki source updated: `docs/wiki/Technical-Development.md`, linked to `docs/design/ui-templates.md`. Publication and clips are verified after merge before the sprint milestone is completed.
