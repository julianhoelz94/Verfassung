# Sprint 47 user-story coverage

The source catalog is [user-stories.md](../user-stories.md). The `e2e/full` Playwright project runs against the built gateway, Caddy, and all required services with data uploaded by `npm run prepopulate`. The ordinary `e2e` project runs with `mock-api.mjs` and checks detailed UI states and actions. A mock project result is not evidence that a backend workflow works.

| User action | Full-stack browser test | Detailed UI test |
| --- | --- | --- |
| Browse countries, choose a constitution and version, read an article | `real-journeys.spec.ts`: visitor reads a published constitution | `public-stories.spec.ts`: visitor follows country/version/article/history; `journeys.spec.ts`: browse from countries |
| Compare legal versions and read amendment documents on the timeline | `real-journeys.spec.ts`: visitor compares legal versions | `public-stories.spec.ts`: compare and timeline; `journeys.spec.ts`: structured change |
| Search published article text | `real-journeys.spec.ts`: visitor finds imported text | `public-stories.spec.ts`: filters and historical context; `journeys.spec.ts`: search |
| Read article history, provenance, About, source and accessibility pages, print and share | — | `public-stories.spec.ts`: history, scope, provenance, print; `journeys.spec.ts`: article history |
| Viewer signs in, reads, sees account, and signs out | `real-journeys.spec.ts`: viewer signs in | `login-stories.spec.ts`: viewer role and denied routes |
| Editor, reviewer, publisher, and administrator sign in with assigned access | `roles.spec.ts`: four real role permission tests, including MFA | `login-stories.spec.ts`: role navigation, invalid credentials, MFA error and direct-route denial |
| Invitation, password reset/change, MFA enrollment and recovery codes | — | `account-stories.spec.ts`: account lifecycle |
| Editor creates a correction, saves a draft and comment, reviewer approves, publisher publishes, public reader sees result | `roles.spec.ts`: real transcription correction workflow | `journeys.spec.ts`: draft, preview, queues, publication, history and stale quote review |
| Editor drafts and revises legal change records and a legal successor | — | `journeys.spec.ts`: amending law, revision restoration, legal successor and source document |
| Publisher withdraws a change record and confirms stale quotes | — | `journeys.spec.ts`: withdraw and quote confirmation |
| Administrator views constitutions and their outlines | `roles.spec.ts`: admin permission test | `admin-stories.spec.ts`: create/update outline |
| Administrator manages users, service tokens and JSON imports | — | `admin-stories.spec.ts`: access lifecycle, token lifecycle, import |

The full-stack fixture verification separately checks exact counts, nested content, legal predecessor links, amendment revision history, documents, and search indexing. `prepopulate` is idempotent and its `--verify-only` mode checks the same records without creating them.

Stories marked **Planned** in the source catalog are product gaps and have no Sprint 47 test. Rows with `—` in the full-stack column retain UI-only coverage; they should not be described as backend end-to-end coverage.
