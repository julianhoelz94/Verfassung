# Sprint 59 UI and workflow review

Tracking: Sprint 59 in Linear, milestone `0086b99f-ef2d-4032-9514-dd4f1390208c`. [Approved implementation plan](https://linear.app/verfassung/document/sprint-59-complete-ui-and-workflow-review-implementation-plan-263f40097505). Individual issues cannot be created because the workspace free issue limit is exhausted.

Baseline: `e0bacc3` (main, including Sprint 57 localization). Sprint 58 PR #135 is open at audit start; refresh its setup/admin scope before close-out. The audit covers 44 page entry points plus query-driven queues, dynamic create/edit modes, shared controls and exceptional states. Every route below must receive an explicit disposition and browser evidence before close-out.

## Findings and implementation sequence

| Finding | User consequence | Planned resolution |
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

Initial source review completed; browser and final disposition pending. Shared layout improvements apply to every rendered route. Dynamic routes include representative fixture data, missing-data states and applicable roles.

| Route entry point | Role / variants | Final disposition and evidence |
| --- | --- | --- |
| `/` | Public | Pending browser review |
| `/about` | Public | Pending browser review |
| `/account` | Signed-in account | Pending browser review |
| `/account/step-up` | Signed-in account | Pending browser review |
| `/admin` | Admin (imports also editorial roles) | Pending browser review |
| `/admin/anonymous-browsing` | Admin (imports also editorial roles) | Pending browser review |
| `/admin/constitutions` | Admin (imports also editorial roles) | Pending browser review |
| `/admin/constitutions/[id]` | Admin (imports also editorial roles) | Pending browser review |
| `/admin/import` | Admin (imports also editorial roles) | Pending browser review |
| `/admin/import/[jobId]` | Admin (imports also editorial roles) | Pending browser review |
| `/admin/import/setup/[proposalId]` | Admin (imports also editorial roles) | Pending browser review |
| `/admin/legal/[key]` | Admin (imports also editorial roles) | Pending browser review |
| `/admin/settings` | Admin (imports also editorial roles) | Pending browser review |
| `/admin/users` | Admin (imports also editorial roles) | Pending browser review |
| `/countries/[code]` | Public | Pending browser review |
| `/countries/[code]/articles/[articleNumber]` | Public | Pending browser review |
| `/countries/[code]/compare` | Public | Pending browser review |
| `/countries/[code]/constitution-timeline` | Public | Pending browser review |
| `/countries/[code]/constitutions/[constitutionId]` | Public | Pending browser review |
| `/countries/[code]/timeline` | Public | Pending browser review |
| `/countries/[code]/versions/[versionId]` | Public | Pending browser review |
| `/countries/[code]/versions/[versionId]/articles/[articleId]` | Public | Pending browser review |
| `/countries/[code]/versions/[versionId]/units/[unitId]` | Public | Pending browser review |
| `/datenschutz` | Public | Pending browser review |
| `/documents/[id]` | Public | Pending browser review |
| `/editor` | Editor / reviewer / publisher / admin | Pending browser review |
| `/editor/amendments` | Editor / reviewer / publisher / admin | Pending browser review |
| `/editor/amendments/[id]` | Editor / reviewer / publisher / admin | Pending browser review |
| `/editor/documents` | Editor / reviewer / publisher / admin | Pending browser review |
| `/editor/documents/[id]` | Editor / reviewer / publisher / admin | Pending browser review |
| `/editor/documents/new` | Editor / reviewer / publisher / admin | Pending browser review |
| `/editor/history` | Editor / reviewer / publisher / admin | Pending browser review |
| `/editor/lifecycle/[constitutionId]` | Editor / reviewer / publisher / admin | Pending browser review |
| `/editor/wiki/[targetType]/[targetId]` | Editor / reviewer / publisher / admin | Pending browser review |
| `/impressum` | Public | Pending browser review |
| `/invite` | Anonymous / challenged / signed in | Pending browser review |
| `/login` | Anonymous / challenged / signed in | Pending browser review |
| `/login/mfa` | Anonymous / challenged / signed in | Pending browser review |
| `/oauth/authorize` | Anonymous / challenged / signed in | Pending browser review |
| `/register` | Anonymous / challenged / signed in | Pending browser review |
| `/register/confirm` | Anonymous / challenged / signed in | Pending browser review |
| `/reset` | Anonymous / challenged / signed in | Pending browser review |
| `/search` | Public | Pending browser review |
| `/versions/[versionId]/units/[unitId]` | Public | Pending browser review |

## Verification record

Baseline screenshots, route/state/language checks, focused MFA and correction-history journeys, mock and real-stack verification, independent review, CI, merge and Wiki publication will be recorded here as they complete. Screenshots use fictional fixtures and must not expose live credentials. Authenticator setup evidence must use synthetic keys only.
