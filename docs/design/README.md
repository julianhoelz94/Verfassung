# docs/design

Design concept for the responsive UI redesign (backlog Sprints 19–21, UI-29 … UI-39).

| File | Purpose |
| --- | --- |
| [`ui-concept.md`](ui-concept.md) | The concept: principles, layout system and breakpoints, shell, page-by-page specs, component inventory, tokens, migration plan |
| [`role-link-trees.md`](role-link-trees.md) | Navigation tree per role (anonymous, viewer, editor, reviewer, publisher, admin) and the `nav.test.ts` matrix |
| [`tokens.css`](tokens.css) | Proposed design tokens; copied into `apps/gateway-web/app/globals.css` in UI-29 |
| [`prototype/`](prototype/) | Static HTML/CSS prototype (`home`, `version`, `compare`, `editor`); `prototype.css` class names are the implementation contract |
| [`screenshots/`](screenshots/) | Renders of each prototype page at phone (390), tablet (820) and desktop (1440) width |

Preview the prototype:

```bash
cd docs/design && python3 -m http.server 8766
# open http://localhost:8766/prototype/board.html?page=home   (also: version, compare, editor)
```

Re-generate screenshots after changing the prototype: open the board at ~2000px viewport width and capture the full page into `screenshots/board-<page>.png`.
