# Shared constitution workspace implementation review

The accepted [interactive mock](../../prototype/setup-review/README.md) is applied to every production consumer of the old constitution structure workspace:

- `/admin/constitutions`: creation and the existing-constitution list.
- `/admin/constitutions/[id]`: settings, impact/save, documents and previous settings.
- `/admin/import/setup/[proposalId]`: submitted identity/source, proposed display, correction/confirmation/recovery, documents and proposal history.

All three use one full-width viewer-style toolbar and the same Details / Structure / Documents / Review / History tabs. The standard overview icon and measured sticky positioning come from the shared reader chrome. The heading has no extra horizontal separator. Each owner retains its own server actions and permission checks. The document picker and owner inputs remain mounted across navigation; supplementary proposal evidence never replaces submitted source details.

## Browser evidence

Screenshots are the actual production application running locally against synthetic API fixtures, not the hosted mock or live data. English and German were inspected at 390, 820 and 1440px. `e2e/constitution-workspace.spec.ts` checks all 90 owner/tab/language/width combinations for axe violations, overflow, single main/heading, tab panels and viewport-wide toolbars. Structure checks require usable field widths and non-overlapping preview/form bounds. Document retention checks both settings and proposal owners with real shared upload controls, checking file/title persistence and native form isolation.

The existing structure/admin journeys verify presets, native slug validation, explicit creation, contextual insertion, technical-help disclosure, migration/impact gates, saved settings, reader annotations and mobile touch. Proposal journeys verify display persistence, correction reasons, exact previous/current comparison, stale confirmation rejection and subsequent confirmation. Unit regressions cover pending-impact invalidation, restoring history as a draft, keyboard tab selection, direct Review validation and mounted file/field retention.

The original screenshots remain in [the mock's Before comparison](../../prototype/setup-review/before/captures.json). Final application captures are included beside this report. The private hosted mock remains the design reference; these routes use the real backend commands.

Golden snapshots are maintained only with the repository's pinned Playwright 1.55.1 Linux browser. Local behavior checks use the installed system Chromium; the CI visual job supplies the pinned comparison.

| Actual application · German Structure view | Desktop | Phone |
| --- | --- | --- |
| Create | [1440px](create-de-1440.png) | [390px](create-de-390.png) |
| Settings | [1440px](settings-de-1440.png) | [390px](settings-de-390.png) |
| Import proposal | [1440px](proposal-de-1440.png) | [390px](proposal-de-390.png) |

Local verification: 42 Node contract tests and 1,586 Vitest tests passed; typecheck, lint, production build and TypeScript complexity gate passed. The focused browser run passed all 24 journeys, including the 90-tab accessibility/reflow audit.

The 15 affected golden images were reviewed from CI run [43011811871](https://github.com/julianhoelz94/Verfassung/actions/runs/43011811871), artifact `13850499412`, produced by `mcr.microsoft.com/playwright:v1.55.1-jammy` at commit `2e4cdf082cef226cb33e04a548e0489e4654b6c4`. Only `outlines-*`, `review-admin-constitutions-id-*` and `review-admin-import-setup-proposalId-*` baselines changed. All other pinned visual comparisons passed in that run. The subsequent Details additions keep the same initial screenshot views and receive the full bilingual tab audit.

Details uses shared read-only fact groups, a projection of every allowed hierarchy path and an Inspect structure action. Setup proposals also show their literal submitted sample and a View evidence action; revised proposals link to their exact comparison. Saved settings display available version counts and revision identifiers from Catalog, without simulated draft counts.

Details captures: [settings](settings-de-1440-details.png) · [setup proposal](proposal-de-1440-details.png). Additional local browser checks passed for the shared help/spacing, scoped import evidence and complete package approval/publication journeys. Correction reasons retain their values through Details → Structure → Review.
