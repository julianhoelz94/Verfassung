# docs/design

Design concept for the responsive UI redesign (backlog Sprints 19–21, UI-29 … UI-39) and two-axis versioning ([ADR 0005](../adr/0005-two-axis-versions.md), Sprints 34–39).

| File | Purpose |
| --- | --- |
| [`ui-concept.md`](ui-concept.md) | The concept: principles, layout system and breakpoints, shell, page-by-page specs, component inventory, tokens, migration plan |
| [`role-link-trees.md`](role-link-trees.md) | Navigation tree per role (anonymous, viewer, editor, reviewer, publisher, admin) and the `nav.test.ts` matrix |
| [`two-axis-versions.md`](two-axis-versions.md) | Legal × editorial versioning ([ADR 0005](../adr/0005-two-axis-versions.md)). **Sprint UI reference** maps stories to configured prototype hashes. Canvas: [legal vs editorial chain](/Users/julianhoelz/.cursor/projects/Users-julianhoelz-Documents-Verfassung/canvases/legal-vs-editorial-chain.canvas.tsx) |
| [`tokens.css`](tokens.css) | Proposed design tokens; copied into `apps/gateway-web/app/globals.css` in UI-29 |
| [`prototype/`](prototype/) | Static HTML/CSS. Sprint 19–21 shell: `home`, `version`, `compare`, `editor`. **Configured two-axis mocks:** `editor-constitution.html` hashes listed in [`two-axis-versions.md`](two-axis-versions.md) § Sprint UI reference. `prototype.css` class names are the implementation contract. |
| [`screenshots/`](screenshots/) | Renders of each prototype page at phone (390), tablet (820) and desktop (1440) width |

Preview the prototype:

```bash
cd docs/design && python3 -m http.server 8766
# open http://localhost:8766/prototype/board.html?page=home   (also: version, compare, editor)
# two-axis mocks (Sprints 34–39) — hashes in two-axis-versions.md § Sprint UI reference:
#   http://localhost:8766/prototype/editor-constitution.html#timeline
#   http://localhost:8766/prototype/editor-constitution.html#legal
#   http://localhost:8766/prototype/editor-constitution.html#correct-1949
#   http://localhost:8766/prototype/editor-constitution.html#hop-1956
#   http://localhost:8766/prototype/board.html?page=editor-constitution#legal
```

Re-generate screenshots after changing the prototype: open the board at ~2000px viewport width and capture the full page into `screenshots/board-<page>.png`.
