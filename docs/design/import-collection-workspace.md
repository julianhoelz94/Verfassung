# Imports and the shared work collection

The accepted Imports mock follows the merged editorial inbox (PR #258).
`apps/gateway-web/app/components/layout/WorkCollection.tsx` and its CSS own the
actual common presentation, consumed by both adapters. This is not a second
editor implementation or a new lifecycle-creation page.

- `WorkCollectionFrame`, `WorkCollectionHeader` and `WorkCollectionMenu` own the
  full-width, measured sticky chrome, header variants and content measure.
- `WorkCollectionFilters` owns search, disclosure, focus restoration and chip
  placement. Each adapter owns its applied criteria and result pagination.
- `WorkCollectionGroup`, `WorkCollectionSection`, `WorkCollectionRow`,
  `WorkRowLink` and `WorkRowAction` own the grouped list. Next-action labels and
  arrows stay together at narrow widths; status/actions may move below a title.
- `WorkContextLayout` and `WorkContextToggle` retain hidden context controls.
  Editor uses its existing focused side pane; Imports uses creation guidance.

Editor keeps its role-specific queues, commands, account-scoped URL/return memory,
pagination, focus and scroll, real editing canvas and context fields. Imports
keeps its authorised jobs/packages, both upload contracts and draft File/JSON
controls. Failed staging remains in the form. Its optional list/membership
failures are explicit; uncertain package members are not duplicated as jobs.
Only actual snapshot items contribute to the displayed version-ready count.

Existing individual/package review and constitution-setup components remain
unchanged apart from their canonical destinations. The reader/source/compare
display modes, fixed capture/checksum/provenance, separate supplementary evidence,
`import_job`/`setup_proposal`/`migration_run` owners and revision pins remain with
their existing services and adapters. JSON ingestion is not a library attachment.

## Canonical routes and compatibility

| Previous entry | Canonical entry |
| --- | --- |
| `/admin/import` and its mode query | `/import` and the same mode query |
| `/editor?importJobId=:id` | `/import/jobs/:id` |
| `/admin/import/setup/:id` | `/import/setup/:id` |
| `/admin/import/packages/:id` | `/import/packages/:id` |
| `/admin/migrations` | `/import` |
| `/admin/migrations/:id` | `/import/packages/:id` |

Proxy first applies deployment admission, then permanently redirects only
GET/HEAD legacy reads. It preserves all other query values, package selection,
return context and fragment inheritance. Ordinary editor/session URLs are not
redirected. Old page modules remain as POST/server-action adapters, preserving
framework origin checks and server authorisation. Actions generate canonical
success/error, login and MFA return URLs. API endpoints are unchanged. Global
navigation, breadcrumbs, document usage, MCP outputs and route inventory use the
canonical family. Retired pre-launch entrypoints remain unavailable.

Anchor-only intake links (`#upload` and `#structure`) also select and reveal the
matching mounted form after hydration. Switching between these anchors, modes
or tabs preserves each form's file and JSON draft.

## Validation

Unit contracts cover access, complete lists, unavailable membership, pins,
canonical URL encoding, query/fragment retention and POST dispatch. Browser
journeys cover the real intake actions, rejection/file retention, role limits,
filters/chips, both modes/context, full-width chrome, existing editor return
memory, supplementary evidence and approved review display modes. Inspect EN/DE
at 390/820/1440px, plus 320px and enlarged-text action reflow. Golden comparisons
must use the repository's pinned Playwright image; system-browser captures are
behaviour/layout evidence only. Wiki sources are updated; publication follows
its normal post-merge workflow.

The twelve updated intake baselines were reviewed from CI run `44056997172`,
artifact `14317220723`, using the pinned Playwright image. Existing Editor and
review/setup comparison baselines remain authoritative.
