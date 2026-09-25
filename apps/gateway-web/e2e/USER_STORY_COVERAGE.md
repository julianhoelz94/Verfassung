# User story Playwright coverage

This matrix maps the implemented stories in `docs/user-stories.md` to browser journeys. Story numbers are the bullet order within each user type. Stories marked **Planned** in the catalog are excluded because the corresponding product behavior does not exist yet.

The journeys in the table below use `mock-api.mjs` and verify UI behavior against mutable mock state. They do not prove backend persistence. The separate `e2e/full` project runs against built gateway, Caddy, and all required services, with records uploaded and checked by `npm run prepopulate`.

| Real-stack action | Full-stack Playwright test |
| --- | --- |
| Browse a country, version, and article | `full/real-journeys.spec.ts`: visitor reads a published constitution |
| Compare legal versions and read timeline documents | `full/real-journeys.spec.ts`: visitor compares legal versions |
| Search imported article text | `full/real-journeys.spec.ts`: visitor finds imported text |
| Viewer signs in, sees account, and signs out | `full/real-journeys.spec.ts`: viewer signs in |
| Editor, reviewer, publisher, and admin access with real MFA | `full/roles.spec.ts`: four role permission tests |
| Draft, review, publish, and read an editorial correction | `full/roles.spec.ts`: real transcription correction |
| Admin imports JSON and opens the published version | `full/roles.spec.ts`: administrator imports a new constitution |
| Admin invite, visitor activation, password change and reset | `full/account-admin.spec.ts`: real account lifecycle |
| Admin creates, rotates and revokes a service token | `full/account-admin.spec.ts`: real token lifecycle |

The fixture verifier checks 2 countries, 2 constitutions, 5 published versions, 60 article snapshots, 3 amendments, nested content, predecessor links, revision history, source documents, and indexed search hits. A second upload and `--verify-only` pass prove idempotence. Legal successor publication and change-record revision and withdrawal currently have mock-only browser coverage.

| Stories | Playwright journey | Durable outcome or permission assertion |
| --- | --- | --- |
| Anonymous 1–8, 13 | `public-stories.spec.ts` — `visitor follows the country, legal version, article and history`; `visitor can reach provenance and a print action on narrow screens` | Opens a country, historical and current versions, permanent article URL, adjacent articles and article history; invokes the browser print action. |
| Anonymous 9–11 | `public-stories.spec.ts` — `visitor filters search and result retains its version` | Applies country, version, and effective-date filters, then verifies that the result opens the same historical snapshot. |
| Anonymous 12 | `public-stories.spec.ts` — `visitor compares versions and changes the article scope` | Renders structured additions/removals and switches between all and changed articles. |
| Anonymous 14–16 | `public-stories.spec.ts` — timeline, provenance, and site-scope journeys | Verifies the source document and version transition, source/trust panel, About, sources, verification, and accessibility content. |
| Anonymous 17–19 | `account-stories.spec.ts` — invite and password-reset journeys; `login-stories.spec.ts` role loop | Activates an invitation, completes a reset, and signs in with the required authenticator challenge. |
| Viewer 1–2, 5 | `login-stories.spec.ts` — `viewer signs in, sees permitted navigation, and signs out`; `viewer cannot use editorial or administrative pages by direct URL` | Shows the account identity, preserves public navigation, hides privileged navigation, denies direct privileged URLs, and invalidates the session on logout. |
| Viewer 3–4 | `account-stories.spec.ts` — `viewer changes password, enrolls MFA and receives recovery codes` | Confirms the password update, MFA secret, initial recovery codes, and regenerated recovery codes. |
| Editor 1–5, 7–11 | `journeys.spec.ts` — draft lifecycle, correction history, and public-reader title journeys | Selects the source version; opens and resumes a session URL; filters articles; edits, saves, and reads the preview and draft marker; submits it; observes status transitions; edits and reads back a nested title from the public article; and finds the resulting staff snapshot without adding a legal timeline event. Editor 6 is Planned. |
| Editor 12–17 | `journeys.spec.ts` — recorded-law, revision-restore, stale-quote, and correction-history journeys | Saves and reads title, citation, dates, summary, comment, source document, source/target versions, and suggested affected articles; inspects and restores an earlier revision; detects stale quotes after a correction and republishes without changing the public comment; verifies retained history. |
| Reviewer 1–5 | `journeys.spec.ts` — queue-based edit/review/publish, legal-successor, stale-quote, and evidence journeys | A separately authenticated reviewer selects submitted work from the review queue, sees its preview, source, change record and document, browses legal-change and snapshot evidence, and approves it. Reviewer 6 is Planned. |
| Publisher 1–4, 6–8 | `journeys.spec.ts` — queue-based publish, legal-successor, withdrawal, enforced step-up, stale-quote, and correction-history journeys | A separately authenticated publisher selects approved work from the publish queue, publishes legal and editorial successors, is redirected to fresh authentication before a stale legal publish, verifies the public 2027 version and source record, withdraws a bad record, handles flagged evidence, reads a ready search-index status, and preserves public timeline semantics. Publisher 5 is Planned. |
| Administrator 1 | `admin-stories.spec.ts` — `administrator can carry an editorial correction through every role action`; role navigation journey | Uses administrator permissions to edit, submit, approve, and publish a correction and confirms combined editorial and administrator navigation. |
| Administrator 2–6 | `admin-stories.spec.ts` — `administrator manages a user and its access lifecycle` | Invites a user with roles, reads its status, changes roles, and issues a reset; mutable mock state proves the subsequent read reflects the writes. |
| Administrator 7 | `admin-stories.spec.ts` — `administrator creates, rotates and revokes a service token` | Creates and reads a scoped token, rotates its one-time secret, revokes it, and reads the revoked state. |
| Administrator 8–10 | `admin-stories.spec.ts` — `administrator creates a constitution and changes its outline settings` | Creates a constitution with country, slug, title and a deeper layer, reads it back, changes the layer presentation, saves it, and reads back the saved setting. |
| Administrator 11 | `admin-stories.spec.ts` — `administrator imports constitution JSON and opens the resulting version link` | Submits valid constitution JSON, reads the completed import job, and verifies its published-version link. |
| Shared 1, 4 | `login-stories.spec.ts` role loop and administrator journey | Verifies role-derived navigation for each role and the union of actions for the multi-capability administrator. |
| Shared 2 | `login-stories.spec.ts` viewer and reviewer direct-URL tests | Shows explicit access messages and omits forbidden controls. |
| Shared 3 | `login-stories.spec.ts` invalid and valid MFA journeys | Rejects an invalid authenticator code without a session and accepts a valid challenge for sensitive roles. |

The mock API is reset before each test and holds mutable workflow state during a journey. Mutation tests assert later mock reads or mock public outcomes instead of only checking a success message.
