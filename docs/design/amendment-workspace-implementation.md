# Approved amendment workspace implementation

The approved mock in `prototype/amendment-workspace/` is the visual and interaction reference. This implementation covers the amendment workspace and shared document management in amendment, constitution configuration, and continuous constitution editors. Existing legal/editorial semantics and permissions remain authoritative.

## Plan

1. Use shared PageChrome, WorkspacePage, fields, layout primitives and ConstitutionDocument. Keep one amendment-wide snapshot pair and public comment above affected passages. Give Details, Review, Documents, History and Publication distinct task views. Keep forms mounted across switches, including revision inspection.
2. Display one affected passage at a time, with optional contents, previous/next controls, shared before/after comparison and progressively disclosed exact mapping. Preserve pending targets, old references, passage notes, mismatch reasons, rich source rendering and immutable snapshot identities.
3. Reuse the existing difference-review engine and commands. Share comparison presentation; retain filters, progress, split/merge decisions, exclusions, acknowledgement and refresh. Use the saved pair for review and require saving a changed pair before reviewing it.
4. Promote the approved document template to production. Both editors offer equally styled upload/choose actions. A single upload submission creates a reusable central record, stores its file and attaches the pinned revision. Perform this transaction in document-service; reject invalid/unauthorized targets without partial records. Give retries a stable operation ID to prevent duplicate creation. Update attachment state without page navigation or loss of unsaved text.
5. Keep publication/withdrawal/quote confirmation and historical restore separate from draft save. Preserve read-only inspection and draft-scoped attachments. New amendments save their identity before documents can be attached.
6. Verify service persistence, retries, rollback and permissions; verify editor navigation, unsaved context, global pair, document reuse and responsive EN/DE rendering. Run document-service tests and gateway lint/build plus focused browser tests.

## Capability and acceptance map

| Requirement | Observable outcome | Forbidden outcome |
| --- | --- | --- |
| One legal amendment across a constitution | One pair selector above all affected passages | Independent article-level version pairs |
| Prominent public comment | Comment remains visible on passage view; separate passage notes | Exclusion rationale becomes public comment |
| Compact tooling | Details, Review, Documents, History, Publication accessible in menu | Removed editorial capabilities |
| One-step evidence | One submission creates file/URL record and pinned attachment | Empty orphan record after invalid upload/target |
| Shared library | Uploaded record selectable from the other editor | Duplicate record when reusing an existing document |
| Preserve edit context | Document actions and task switches retain unsaved text/comment | Full navigation on attachment |
| Immutable publication | Draft commands and document linking do not publish | Historical pins or public revisions rewritten |
| Retry safety | Same operation and payload returns same document | Duplicate document/link after lost response |
| Mobile and keyboard | Wrapped menus, 44px controls, labelled fields, visible focus | Overflow or unreachable invalid fields |

Related original stories: VER-206, VER-232, VER-240, VER-241 (already Done). This follow-up is untracked maintenance; it does not reopen those completed stories.

## Delivery evidence

Implemented on `codex/amendment-workspace`. The current form stays mounted across task switches; history inspection never replaces it. New and existing amendments share the workspace. The document template is used in continuous and legacy constitution editing, constitution configuration and amendments. Caddy retains `/api/editor/*` for editor-service; the gateway document adapter uses `/editor/documents/command`.

Verified locally on 4 November 2026:

- Gateway: lint, production build and 1,221 Vitest tests (plus 31 Node tests) pass. Exact passage projection includes nested wording, authored line breaks and table cells. Draft-save failure outcomes retain the entered form.
- Document-service: all 26 tests and Spotless checks pass, including byte-for-byte file read-back, pinned revision reuse, changed-payload rejection, concurrent retries, unauthorized requests and transaction rollback.
- Real stack: all six amendment/document journeys pass through Caddy with owning services and Postgres. They cover both editors, unsaved text/comment retention, one-step file and URL records, central-library reuse, exact file bytes and revision pins, review/exclusion/acknowledgement, historical restore, quote confirmation, publication and withdrawal.
- Layout: EN/DE at 390/820/1440px with axe and overflow checks; 24 affected Linux screenshot baselines refreshed in the pinned Playwright image. The final amendment rendering was checked again after clarifying missing-reference and historical-reference displays.
- Complete gateway browser suite: 156 passed, with two platform-specific visual suites skipped on macOS; the affected screenshot matrices were separately verified in the pinned Linux image.

The local stack uses an isolated Compose project, `verfassung-amendment-workspace`, with fixture data at `http://localhost:18080`. The primary checkout and its unrelated edits are preserved. Production deployment is separate from this implementation.

The follow-up review in PR #231 also checks the previously approved routing retirement. Review found that optional reader-link enrichment could fail amendment reads during a Catalog outage. That lookup now omits unavailable links while preserving saved amendment content and exact reference identities; a regression test also verifies failed lookups are bounded to one per version.

Follow-up verification adds nine component regression tests for external-law retries, one-step file uploads, historical revision pins, read-only evidence, empty-source rejection, amendment-wide pairs, curated passage preservation and failed saves. The gateway suite now has 1,230 passing Vitest tests. The real-stack migration journey verifies the preserved mapping API and exact direct reader target, and asserts that the retired hostname no longer redirects.
