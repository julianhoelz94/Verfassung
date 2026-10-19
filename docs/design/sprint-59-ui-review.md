# Sprint 59 UI and workflow review

Tracking: Sprint 59 in Linear, milestone `0086b99f-ef2d-4032-9514-dd4f1390208c`. [Approved implementation plan](https://linear.app/verfassung/document/sprint-59-complete-ui-and-workflow-review-implementation-plan-263f40097505). Individual issues cannot be created because the workspace free issue limit is exhausted.

Initial baseline: `e0bacc3` (main, including Sprint 57 localization). Sprint 58 PR #135 merged as `d28caf6` during implementation and is integrated in this branch. The final audit covers 45 page entry points plus query-driven queues, dynamic create/edit modes, shared controls and exceptional states. Each route below has an explicit disposition and browser evidence.

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

## Shared design definition

The common design is implemented in `apps/gateway-web/app/globals.css` and shared components rather than independent page themes.

| Rule | Shared definition |
| --- | --- |
| Surfaces and actions | Warm paper `#f7f5f0`, white task surfaces, ink `#16201f`, teal primary actions `#0f5e5e`; existing semantic status pairs retained |
| Typography | System sans-serif controls and headings; serif constitutional reading text; 16px body, 13–14px metadata, 18px/22px section scale and responsive page titles |
| Spacing | 4px base with 4/8/12/16/24/32/48/64px tokens; spacing describes field, task and section hierarchy |
| Width and placement | 1280px maximum workspace, 68ch reading measure, responsive gutters, aligned panels; account/setup/settings use section navigation and a bounded content column |
| Controls | At least 44px control height, wrapping action rows, visible focus and native disclosure markers; phone editor actions remain in flow so they cannot cover fields |
| Components | `PageMain`, `PageHeader`, `Card`, form controls, `Alert`, `DataList`, `Disclosure`, `MfaSetup` and `SnapshotNotice` carry repeatable structure and states |
| Content hierarchy | Legal/source context stays beside the text; corrections, technical metadata and advanced instructions require deliberate inspection |
| Interaction language | Explicit Save, Review and Publish scope; useful normal/error/empty states; English/German terms reviewed together |

The reader, active editor, account and import screenshots are the representative layouts. The same rules also apply to Sprint 58's first-setup page, mail form and ongoing settings. Each surface uses the layout appropriate to its task. Existing data ownership, authorization and publication workflows remain server-enforced.

## Route coverage

Source review and implementation include the merged setup gate, first-deployment page and reorganized settings. Integrated browser verification passed; the route inventory and nine additional task variants are executable in `apps/gateway-web/e2e/fixtures/ui-routes.ts`. Shared layout improvements apply to every rendered route. Dynamic routes include representative fixture data, missing-data states and applicable roles.

| Route entry point | Role / variants | Final disposition and evidence |
| --- | --- | --- |
| `/` | Public | Retained country discovery; shared spacing, type and wrapping improved; EN/DE 390/820/1440 audit passed |
| `/about` | Public | Retained concise site purpose; shared reading measure and title rhythm; EN/DE 390/820/1440 audit passed |
| `/account` | Signed-in account | Preferences / security / connections navigation; optional technical details, QR-first setup and recovery management; EN/DE 390/820/1440 audit passed |
| `/account/step-up` | Signed-in account | Retained focused verification form; shared form spacing and accessible controls; EN/DE 390/820/1440 audit passed |
| `/admin` | Admin (imports also editorial roles) | Grouped people/access and publication tasks; settings and legal destinations discoverable; EN/DE 390/820/1440 audit passed |
| `/admin/anonymous-browsing` | Admin (imports also editorial roles) | Retained saved/effective policy workflow; wrapping controls and consistent fieldsets; EN/DE 390/820/1440 audit passed |
| `/admin/constitutions` | Admin (imports also editorial roles) | Retained guided identity / structure / review creation; responsive shared outline panels; EN/DE 390/820/1440 audit passed |
| `/admin/constitutions/[id]` | Admin (imports also editorial roles) | Retained structure impact / save workflow; consistent panels and readable form rhythm; EN/DE 390/820/1440 audit passed |
| `/admin/import` | Admin (imports also editorial roles) | Existing/new workflow choice; file-first upload, optional JSON and prerequisites; EN/DE 390/820/1440 audit passed |
| `/admin/import/[jobId]` | Admin (imports also editorial roles) | Retained private preview and separate prepare / review / publish actions; readable panels; EN/DE 390/820/1440 audit passed |
| `/admin/import/setup/[proposalId]` | Admin (imports also editorial roles) | Retained source / structure / final review sequence; responsive shared outline panels; EN/DE 390/820/1440 audit passed |
| `/admin/legal/[key]` | Admin (imports also editorial roles) | Added discoverable imprint/privacy selector preserving language; aligned operator fields and spaced language links; EN/DE 390/820/1440 audit passed |
| `/admin/settings` | Admin (imports also editorial roles) | Site settings title; registration/mail groups, responsive fields and explicit save scope; EN/DE 390/820/1440 audit passed |
| `/admin/users` | Admin (imports also editorial roles) | Retained user lifecycle and token actions; consistent wrapping action rows and larger controls; EN/DE 390/820/1440 audit passed |
| `/countries/[code]` | Public | Reading and legal history primary; structure/corrections secondary; ordinary links read current corrected snapshot; EN/DE 390/820/1440 audit passed |
| `/countries/[code]/articles/[articleNumber]` | Public | Legal versions only, current corrected content, localized title and valid nested heading levels; EN/DE 390/820/1440 audit passed |
| `/countries/[code]/compare` | Public | Retained legal comparison controls; readable wrapping and shared spacing; EN/DE 390/820/1440 audit passed |
| `/countries/[code]/constitution-timeline` | Public | Retained legal chronology emphasis; shared responsive cards and typography; EN/DE 390/820/1440 audit passed |
| `/countries/[code]/constitutions/[constitutionId]` | Public | Retained contextual wiki and source content; shared reading rhythm; EN/DE 390/820/1440 audit passed |
| `/countries/[code]/timeline` | Public | Retained legal-change timeline and source links; wrapping actions and panels; EN/DE 390/820/1440 audit passed |
| `/countries/[code]/versions/[versionId]` | Public | Legal-only pager using current corrected snapshots; exact older pins get compact archive notice; EN/DE 390/820/1440 audit passed |
| `/countries/[code]/versions/[versionId]/articles/[articleId]` | Public | Exact snapshot links retained; compact archive notice with current-text action; EN/DE 390/820/1440 audit passed |
| `/countries/[code]/versions/[versionId]/units/[unitId]` | Public | Added page title, breadcrumbs, print action, content language and compact archive notice; EN/DE 390/820/1440 audit passed |
| `/datenschutz` | Public | Retained published legal text and language fallback; shared reading measure; EN/DE 390/820/1440 audit passed |
| `/documents/[id]` | Public | Source/download primary; technical revisions secondary unless a revision was explicitly requested; EN/DE 390/820/1440 audit passed |
| `/editor` | Editor / reviewer / publisher / admin | Visible role-aware queues; Back to my sessions accurately describes navigation; responsive panels; EN/DE 390/820/1440 audit passed |
| `/editor/amendments` | Editor / reviewer / publisher / admin | Retained legal-change list and creation entry; shared form/list spacing; EN/DE 390/820/1440 audit passed |
| `/editor/amendments/[id]` | Editor / reviewer / publisher / admin | Retained source/target and quote-review workflow; shared panel and action wrapping; EN/DE 390/820/1440 audit passed |
| `/editor/documents` | Editor / reviewer / publisher / admin | Retained document discovery; shared cards, statuses and action rhythm; EN/DE 390/820/1440 audit passed |
| `/editor/documents/[id]` | Editor / reviewer / publisher / admin | Separated detail edits and file replacement; revision/event maintenance secondary; EN/DE 390/820/1440 audit passed |
| `/editor/documents/new` | Editor / reviewer / publisher / admin | Retained document creation; shared aligned form spacing and file control; EN/DE 390/820/1440 audit passed |
| `/editor/history` | Editor / reviewer / publisher / admin | Text corrections collapsed with immutable snapshot links; legal history remains distinct; EN/DE 390/820/1440 audit passed |
| `/editor/lifecycle/[constitutionId]` | Editor / reviewer / publisher / admin | Localized task title; retained event semantics; consistent form controls; EN/DE 390/820/1440 audit passed |
| `/editor/wiki/[targetType]/[targetId]` | Editor / reviewer / publisher / admin | Localized country/constitution task title and consistently stacked editing form; EN/DE 390/820/1440 audit passed |
| `/impressum` | Public | Retained published operator text/contact workflow; shared reading measure; EN/DE 390/820/1440 audit passed |
| `/invite` | Anonymous / challenged / signed in | Retained focused invite acceptance; shared form rhythm and readable status messages; EN/DE 390/820/1440 audit passed |
| `/login` | Anonymous / challenged / signed in | Plain service-unavailable explanation and focused sign-in controls; EN/DE 390/820/1440 audit passed |
| `/login/mfa` | Anonymous / challenged / signed in | Authenticator first, explicit recovery switch, only selected field validated; QR-first forced enrollment; EN/DE 390/820/1440 audit passed |
| `/oauth/authorize` | Anonymous / challenged / signed in | Retained explicit consent and permission scope; shared card/action spacing; EN/DE 390/820/1440 audit passed |
| `/register` | Anonymous / challenged / signed in | Retained email-first registration; shared concise form layout; EN/DE 390/820/1440 audit passed |
| `/register/confirm` | Anonymous / challenged / signed in | Retained password confirmation and token states; shared status and form layout; EN/DE 390/820/1440 audit passed |
| `/reset` | Anonymous / challenged / signed in | Retained password reset flow; shared readable form controls; EN/DE 390/820/1440 audit passed |
| `/setup` | Bootstrap administrator before completion | Shared section navigation and task grouping; retained completion checks, managed values and optional mail; EN/DE 390/820/1440 audit passed |
| `/search` | Public | Retained search/filter/result workflow; responsive shared cards and wrapping labels; EN/DE 390/820/1440 audit passed |
| `/versions/[versionId]/units/[unitId]` | Public | Retained exact-snapshot redirect; audit requires correct destination; EN/DE 390/820/1440 audit passed |

## Verification record

Local gateway verification passed: 37 Vitest files / 194 tests plus 9 Node tests; lint and production build; 73 mock browser journeys with retries disabled and one expected Linux-only visual skip. The complete route audit visits 45 entry points plus nine task variants in both languages at three widths (324 renders), runs axe on 216 route renders, and checks 320px keyboard/reflow behavior. Additional checks cover anonymous setup navigation, the restricted bootstrap account menu, focus return and completed-settings copy. Fifteen repeated password/QR/recovery journeys passed after fixing lost client redirects.

The integrated Linux screenshot generation passed all 10 cases and produces 174 snapshots for 29 newer templates/variants, alongside the original 33 snapshots. Final German lifecycle/OAuth wording and setup-header baselines were refreshed explicitly. The required x64 CI comparison, real-stack CI, merge and Wiki publication are close-out gates; their results are recorded in the Linear completion note. Screenshots use fictional fixtures; authenticator evidence uses synthetic keys only.

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

Verification identified a real client navigation failure: successful login/password Server Actions returned HTTP 303 with the right destination, but the client sometimes remained on the old page. The affected forms now await a returned, validated destination and load a fresh page. MFA enrollment confirmation keeps its one-time recovery result in explicit client state after the session cookie changes. Independent repetition and full-suite results are recorded in the verification section above.

## Sprint 58 integration

The final scope includes the newly merged `/setup` page, shared mail settings, general/language/access preferences, connection status, managed legal fields, and incomplete-deployment routing. The setup page uses the same responsive section-navigation/content pattern as account and ongoing settings. The shared mail form retains disabled deployment-managed values and its setup/settings return destination while gaining grouped registration/mail fields and an explicit save scope. All setup gates and bootstrap-administrator restrictions from Sprint 58 are retained.

The browser inventory renders `/setup` with incomplete deployment data and a disabled finish action for a missing requirement, then restores completed state before continuing ordinary journeys. Real first-deployment completion, HTTPS and persistence remain covered by Sprint 58's integrated full-stack journeys and required CI.

## Representative before and after evidence

The image links below show the shared rules applied to different tasks. Baseline captures use the original development build; final captures use the integrated production build. The session-hub comparison and active editing layout are identified separately.

| Surface | Before, phone | After, phone | After, desktop |
| --- | --- | --- | --- |
| Reader | [Before](screenshots/sprint-59/before-reader-390.png) | [After](screenshots/sprint-59/after-reader-390.png) | [After](screenshots/sprint-59/after-reader-1440.png) |
| Account | [Before](screenshots/sprint-59/before-account-390.png) | [After](screenshots/sprint-59/after-account-390.png) | [After](screenshots/sprint-59/after-account-1440.png) |
| Import | [Before](screenshots/sprint-59/before-import-390.png) | [After](screenshots/sprint-59/after-import-390.png) | [After](screenshots/sprint-59/after-import-1440.png) |
| Session hub | [Before](screenshots/sprint-59/before-editor-390.png) | [After](screenshots/sprint-59/after-editor-390.png) | [After](screenshots/sprint-59/after-editor-1440.png) |
| Active editor | — | [After](screenshots/sprint-59/after-active-editor-390.png) | [After](screenshots/sprint-59/after-active-editor-1440.png) |
| Ongoing settings | — | [After](screenshots/sprint-59/after-site-settings-390.png) | [After](screenshots/sprint-59/after-site-settings-1440.png) |
| First setup | — | [After](screenshots/sprint-59/after-setup-390.png) | [After](screenshots/sprint-59/after-setup-1440.png) |
