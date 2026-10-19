# Sprint 59 UI and workflow review

Tracking: Sprint 59 in Linear, milestone `0086b99f-ef2d-4032-9514-dd4f1390208c`. [Approved implementation plan](https://linear.app/verfassung/document/sprint-59-complete-ui-and-workflow-review-implementation-plan-263f40097505). Individual issues cannot be created because the workspace free issue limit is exhausted.

Baseline: `e0bacc3` (main, including Sprint 57 localization). Sprint 58 PR #135 is open at audit start; refresh its setup/admin scope before close-out. The audit covers 44 page entry points plus query-driven queues, dynamic create/edit modes, shared controls and exceptional states. Every route below must receive an explicit disposition and browser evidence before close-out.

## Findings and implementation sequence

| Finding | User consequence | Delivered resolution |
| --- | --- | --- |
| Public country cards give correction history the same action treatment as reading | Routine readers see editorial maintenance as a primary task | Put correction history and structural metadata in secondary details; retain legal timeline and exact snapshot links |
| Login always shows both authenticator and recovery fields | Two competing methods obscure the normal action | Explicit method switch, only active field submitted and validated |
| Enrollment exposes manual key alongside QR; recovery replacement always shown | Security setup is unnecessarily dense | QR first, accessible manual fallback and recovery management on demand; new codes remain visible once |
| Account mixes preferences, credentials and client command documentation | Routine tasks require scanning a long page | Section navigation, task grouping and optional advanced connection instructions |
| Admin menu omits settings/legal destinations | Available tasks are hard to find | Complete role-aware navigation and grouped admin landing |
| Import presents two large JSON editors first | Users cannot readily choose their workflow | Choose existing/new structure, file upload first, optional JSON editors and clear prerequisites |
| Broad button nowrap and fixed panel widths | German labels and small screens can overflow | Wrapping actions and minmax layouts, readable essential text and 44px controls |
| Multiple panel styles and undefined legacy color variables | Staff tools look inconsistent | Shared token-based panel, form, disclosure and list patterns |
| Some UI messages show implementation vocabulary or raw identifiers | Users cannot predict an action or understand state | English/German copy pass; technical details secondary |
| Current visual coverage captures 11 page families | Several newer task screens can regress unnoticed | Route inventory, expanded screenshot/axe coverage and workflow assertions |

## Design rules

Warm paper and white surfaces, teal actions, serif reading text and sans-serif controls. Use a clear page title and context, aligned task sections, consistent spacing, limited card nesting and readable line lengths. Public content uses a generous reading measure; staff workspaces use available width without stretching simple forms. Each task has a clear primary action, with secondary and destructive actions distinguished. Source/legal context stays visible; technical implementation details require deliberate inspection. English and German are reviewed together at 390, 820 and 1440px, with narrow reflow and zoom checks.

## Route coverage

Source review and implementation completed. Browser verification is in progress; the route inventory and nine additional task variants are executable in `apps/gateway-web/e2e/fixtures/ui-routes.ts`. Shared layout improvements apply to every rendered route. Dynamic routes include representative fixture data, missing-data states and applicable roles.

| Route entry point | Role / variants | Final disposition and evidence |
| --- | --- | --- |
| `/` | Public | Retained country discovery; shared spacing, type and wrapping improved; browser evidence pending |
| `/about` | Public | Retained concise site purpose; shared reading measure and title rhythm; browser evidence pending |
| `/account` | Signed-in account | Preferences / security / connections navigation; optional technical details, QR-first setup and recovery management; browser evidence pending |
| `/account/step-up` | Signed-in account | Retained focused verification form; shared form spacing and accessible controls; browser evidence pending |
| `/admin` | Admin (imports also editorial roles) | Grouped people/access and publication tasks; settings and legal destinations discoverable; browser evidence pending |
| `/admin/anonymous-browsing` | Admin (imports also editorial roles) | Retained saved/effective policy workflow; wrapping controls and consistent fieldsets; browser evidence pending |
| `/admin/constitutions` | Admin (imports also editorial roles) | Retained guided identity / structure / review creation; responsive shared outline panels; browser evidence pending |
| `/admin/constitutions/[id]` | Admin (imports also editorial roles) | Retained structure impact / save workflow; consistent panels and readable form rhythm; browser evidence pending |
| `/admin/import` | Admin (imports also editorial roles) | Existing/new workflow choice; file-first upload, optional JSON and prerequisites; browser evidence pending |
| `/admin/import/[jobId]` | Admin (imports also editorial roles) | Retained private preview and separate prepare / review / publish actions; readable panels; browser evidence pending |
| `/admin/import/setup/[proposalId]` | Admin (imports also editorial roles) | Retained source / structure / final review sequence; responsive shared outline panels; browser evidence pending |
| `/admin/legal/[key]` | Admin (imports also editorial roles) | Added discoverable imprint/privacy selector preserving language; aligned operator fields and spaced language links; browser evidence pending |
| `/admin/settings` | Admin (imports also editorial roles) | Site settings title; registration/mail groups, responsive fields and explicit save scope; browser evidence pending |
| `/admin/users` | Admin (imports also editorial roles) | Retained user lifecycle and token actions; consistent wrapping action rows and larger controls; browser evidence pending |
| `/countries/[code]` | Public | Reading and legal history primary; structure/corrections secondary; ordinary links read current corrected snapshot; browser evidence pending |
| `/countries/[code]/articles/[articleNumber]` | Public | Legal versions only, current corrected content, localized title and valid nested heading levels; browser evidence pending |
| `/countries/[code]/compare` | Public | Retained legal comparison controls; readable wrapping and shared spacing; browser evidence pending |
| `/countries/[code]/constitution-timeline` | Public | Retained legal chronology emphasis; shared responsive cards and typography; browser evidence pending |
| `/countries/[code]/constitutions/[constitutionId]` | Public | Retained contextual wiki and source content; shared reading rhythm; browser evidence pending |
| `/countries/[code]/timeline` | Public | Retained legal-change timeline and source links; wrapping actions and panels; browser evidence pending |
| `/countries/[code]/versions/[versionId]` | Public | Legal-only pager using current corrected snapshots; exact older pins get compact archive notice; browser evidence pending |
| `/countries/[code]/versions/[versionId]/articles/[articleId]` | Public | Exact snapshot links retained; compact archive notice with current-text action; browser evidence pending |
| `/countries/[code]/versions/[versionId]/units/[unitId]` | Public | Added page title, breadcrumbs, print action, content language and compact archive notice; browser evidence pending |
| `/datenschutz` | Public | Retained published legal text and language fallback; shared reading measure; browser evidence pending |
| `/documents/[id]` | Public | Source/download primary; technical revisions secondary unless a revision was explicitly requested; browser evidence pending |
| `/editor` | Editor / reviewer / publisher / admin | Visible role-aware queues; Back to my sessions accurately describes navigation; responsive panels; browser evidence pending |
| `/editor/amendments` | Editor / reviewer / publisher / admin | Retained legal-change list and creation entry; shared form/list spacing; browser evidence pending |
| `/editor/amendments/[id]` | Editor / reviewer / publisher / admin | Retained source/target and quote-review workflow; shared panel and action wrapping; browser evidence pending |
| `/editor/documents` | Editor / reviewer / publisher / admin | Retained document discovery; shared cards, statuses and action rhythm; browser evidence pending |
| `/editor/documents/[id]` | Editor / reviewer / publisher / admin | Separated detail edits and file replacement; revision/event maintenance secondary; browser evidence pending |
| `/editor/documents/new` | Editor / reviewer / publisher / admin | Retained document creation; shared aligned form spacing and file control; browser evidence pending |
| `/editor/history` | Editor / reviewer / publisher / admin | Text corrections collapsed with immutable snapshot links; legal history remains distinct; browser evidence pending |
| `/editor/lifecycle/[constitutionId]` | Editor / reviewer / publisher / admin | Localized task title; retained event semantics; consistent form controls; browser evidence pending |
| `/editor/wiki/[targetType]/[targetId]` | Editor / reviewer / publisher / admin | Localized country/constitution task title and consistently stacked editing form; browser evidence pending |
| `/impressum` | Public | Retained published operator text/contact workflow; shared reading measure; browser evidence pending |
| `/invite` | Anonymous / challenged / signed in | Retained focused invite acceptance; shared form rhythm and readable status messages; browser evidence pending |
| `/login` | Anonymous / challenged / signed in | Plain service-unavailable explanation and focused sign-in controls; browser evidence pending |
| `/login/mfa` | Anonymous / challenged / signed in | Authenticator first, explicit recovery switch, only selected field validated; QR-first forced enrollment; browser evidence pending |
| `/oauth/authorize` | Anonymous / challenged / signed in | Retained explicit consent and permission scope; shared card/action spacing; browser evidence pending |
| `/register` | Anonymous / challenged / signed in | Retained email-first registration; shared concise form layout; browser evidence pending |
| `/register/confirm` | Anonymous / challenged / signed in | Retained password confirmation and token states; shared status and form layout; browser evidence pending |
| `/reset` | Anonymous / challenged / signed in | Retained password reset flow; shared readable form controls; browser evidence pending |
| `/search` | Public | Retained search/filter/result workflow; responsive shared cards and wrapping labels; browser evidence pending |
| `/versions/[versionId]/units/[unitId]` | Public | Retained exact-snapshot redirect; audit requires correct destination; browser evidence pending |

## Verification record

Baseline screenshots, route/state/language checks, focused MFA and correction-history journeys, mock and real-stack verification, independent review, CI, merge and Wiki publication will be recorded here as they complete. Screenshots use fictional fixtures and must not expose live credentials. Authenticator setup evidence must use synthetic keys only.

## Review corrections

Independent review restored discovery of the privacy-notice editor through a labelled legal-page selector. Additional review tightened native disclosure markers, language-link spacing, legal contact-field alignment, the desktop settings-sidebar selector and German import wording. Browser fixtures now include normal SMTP settings and a bound import structure; the audit asserts destination URLs and rejects failed-loading states instead of counting redirects or error pages as coverage.

The duplicate/dead-code scan removed superseded button/alert styles and an unused history helper. Shared `Disclosure`, `MfaSetup`, and `SnapshotNotice` components avoid repeating the new behavior. No public APIs, applied migrations or contract fixtures were removed.

The before images in `screenshots/sprint-59/` were captured with fictional data from the baseline development server. Its editor image shows the session hub, not an active editing session; browser coverage separately includes the active correction editor. After images use the production build. Linux screenshot baselines live in `apps/gateway-web/e2e/snapshots/` and cover both languages for the newer page templates.

## Copy decisions and workflow coverage

| Information / action | Decision and reason | Journey evidence |
| --- | --- | --- |
| Effective dates, sources and verification | Keep visible: needed to identify and assess the legal text | `public-stories`, `ordered-reader`, real-stack `real-journeys` |
| Typo/correction feeds and internal snapshot IDs | Move to secondary details: routine readers need legal chronology; exact pins remain reproducible | `mfa-review`, `journeys`, real-stack `roles` |
| MFA recovery entry and manual setup key | Reveal deliberately; show authenticator code / QR first; new recovery codes stay visible once | `mfa-review`, `account-stories`, real-stack `account-admin` |
| Account command examples and connection identifiers | Move to optional help; keep permission/expiry/one-time-secret consequences beside actions | real-stack `oauth-mcp`, `mcp-import` |
| Import JSON editors | Move behind disclosure; offer existing/new workflow choice and file upload first | `admin-stories`, real-stack `roles` |
| “Discard changes” navigation | Rewrite as “Back to my sessions”: leaving the editor is not a deletion | `journeys`, real-stack `roles` |
| Registration/mail/translation configuration | Rename Site settings and state each Save scope | `admin-stories`, real-stack `self-registration` |
| Technical failure messages | Shorten normal explanation and offer retry; diagnostic details stay optional | existing session-unavailable, login-error and error-boundary states |
| Legal-page drafts, saved preview, separate publication | Keep explicit: these explain the publication consequence | `consent`, real-stack `legal-pages` |

The ordinary-role sign-in journeys cover viewer, editor, reviewer, publisher and admin navigation. Restricted direct URLs and expired administrator sessions are checked separately. Session creation/resume and empty/review/publication queues, save/submit/approve/publish, stale quote review, restore and withdrawal retain existing focused journeys. Rich nested text, tables, notes and inline references are exercised in the real-stack `rich-structure` and `structured-editor` suites using API-uploaded fixtures. These are behavior checks in addition to the route gallery; a successful gallery render alone is not used to claim publication correctness.

Verification identified a real client navigation failure: successful login/password Server Actions returned HTTP 303 with the right destination, but the client sometimes remained on the old page. The affected forms now await a returned, validated destination and load a fresh page. MFA enrollment confirmation keeps its one-time recovery result in explicit client state after the session cookie changes. Independent repetition and full-suite results are recorded below.
