# Sprint 63 — Reusable UI templates and vanilla CSS

Status: implementation in progress. Linear milestone: `0c315d76-26bb-449a-b211-8bf8aa4a2fc2` in the Verfassung project. Individual issue creation was rejected by Linear's workspace free issue limit; no issue identifier exists and unrelated issues remain untouched.

## Delivery scope

1. Consolidate runtime tokens and define spacing ownership. A parent layout owns sibling gaps; a surface owns internal padding; a field owns label/control/help/error spacing.
2. Add typed `Stack`, `Inline`, `Grid`, and `Section` components, explicit page widths, and scoped vanilla CSS Modules.
3. Deliver `FocusedPage`, `SettingsPage`, `CollectionPage`, `ReaderPage`, and `WorkspacePage` templates. Templates compose existing server/client content without fetching data or owning server actions.
4. Pilot account, setup, and site settings. Migrate the remaining route families and remove superseded layout CSS as each owner moves.
5. Extend shared fields with accessible help/error associations. Preserve native controls, translations, authored legal text, API ownership, authorization and publication workflows.
6. Verify English/German at 390, 820, and 1440px and reflow at 320px; inspect Linux screenshot changes, exercise conditional/error/dense states, and update developer documentation.
7. Run independent reviewer and verifier correction loops on the full diff, pass required CI, merge, and verify the post-merge Wiki publication and editorial clips before recording completion.

## Verification

Gateway checks: `npm test`, `npm run typecheck`, `npm run lint`, `npm run build`, and `npm run test:e2e`. Existing route inventory, axe audits, visual snapshots and real-stack CI remain the verification baseline. Screenshot updates require inspection of changes. Completion evidence will be recorded here and in the Linear milestone.
