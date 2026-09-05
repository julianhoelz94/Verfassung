# Role link trees

One tree per principal. Roles are the ones in [`../editorial-roles.md`](../editorial-roles.md); a user may hold several, in which case the trees are merged (union of nodes, each shown once). The tree drives three things in `gateway-web`:

1. **Desktop primary nav** (`primaryNavLinks(user)` in `lib/nav.ts`) — the nodes marked `[nav]`.
2. **Menu disclosure** (`menuSections(user)`, new in `lib/nav.ts`) — every node below, grouped by the headings shown.
3. **Page-level actions** — the indented leaves under a page; they are rendered by that page, not by the menu.

Hiding a node is never authorisation. Every protected route and every backend command still rejects the wrong principal (IDN-8, UI-17).

Legend: `[nav]` appears in the desktop primary bar; `(phone)` only appears in the menu on phones because the desktop bar already shows it; `→` page action.

---

## Anonymous visitor

```
Constitution Atlas
├── Countries [nav]                         /
│   ├── Country                             /countries/[code]
│   │   ├── Version (reader)                /countries/[code]/versions/[versionId]
│   │   │   ├── → Timeline                  /countries/[code]/timeline
│   │   │   ├── → Compare with previous     /countries/[code]/compare?from=&to=
│   │   │   ├── → Search in this version    /search?versionId=&country=
│   │   │   ├── → Print
│   │   │   └── Article                     /countries/[code]/versions/[versionId]/articles/[articleId]
│   │   │       ├── → Previous / Next article
│   │   │       ├── → History of this article   /countries/[code]/articles/[articleNumber]   (UI-23)
│   │   │       ├── → Permalink / Copy link
│   │   │       └── → Print
│   │   ├── Timeline                        /countries/[code]/timeline
│   │   └── Compare                         /countries/[code]/compare
├── Search [nav]                            /search
│   └── Result → Article (keeps version)
├── About [nav]                             /about   (static page, new; explains sources and verification labels)
└── Log in                                  /login
    └── Forgot password                     /reset
```

Footer (all roles): About · Sources · Accessibility.

---

## Viewer (signed in, no editorial role)

Same public tree as the anonymous visitor, plus an account group. No Editor, no Admin.

```
Constitution Atlas
├── Countries [nav]
├── Search [nav]
├── About [nav]
└── ● viewer@example.org  [viewer]
    ├── Account                             /account
    │   ├── → Change password
    │   └── → Sign out of other sessions
    └── Sign out                            (POST logout)
```

---

## Editor

```
Constitution Atlas
├── Countries [nav]                         (public tree as above)
├── Search [nav]
├── Editor [nav]                            /editor
│   ├── Open a session                      /editor  (version select → POST open)
│   ├── My sessions                         /editor?mine=1   (sessions I opened, any status)
│   └── Session                             /editor?sessionId=
│       ├── Article list (filter, draft/new badges)
│       ├── Edit article  → Save draft · Discard
│       ├── Section titles → Save
│       └── → Submit for review             (status open → reviewing)
└── ● editor@example.org  [editor]
    ├── Editorial
    │   ├── My sessions
    │   └── Review queue                    (visible, read-only: shows count, cannot approve)
    ├── Account
    └── Sign out
```

Public reader pages additionally show `→ Edit this article` (opens/loads a session for that version) when the user holds `editor`.

---

## Reviewer

```
Constitution Atlas
├── Countries [nav]
├── Search [nav]
├── Editor [nav]                            /editor
│   ├── Review queue                        /editor?status=reviewing   (default landing for reviewers)
│   ├── Load a session by id                /editor?sessionId=
│   └── Session (read-only text + preview)
│       └── → Approve review                (status reviewing → approved)
└── ● reviewer@example.org  [reviewer]
    ├── Editorial
    │   └── Review queue
    ├── Account
    └── Sign out
```

Reviewers do not see Save / Submit controls; the editor panel renders the draft as read-only text with the diff preview.

---

## Publisher

```
Constitution Atlas
├── Countries [nav]
├── Search [nav]
├── Editor [nav]                            /editor
│   ├── Ready to publish                    /editor?status=approved   (default landing for publishers)
│   ├── Load a session by id
│   └── Session (read-only text + preview)
│       └── → Publish                       (status approved → published; step-up auth once IDN-10 lands)
└── ● publisher@example.org  [publisher]
    ├── Editorial
    │   └── Ready to publish
    ├── Account
    └── Sign out
```

Combined `editor + reviewer + publisher` (the local seed account) sees the union: Open a session, My sessions, Review queue, Ready to publish, and all three action buttons appear according to session status.

---

## Admin

Admin holds every editorial capability and every administrative destination.

```
Constitution Atlas
├── Countries [nav]
├── Search [nav]
├── Editor [nav]                            (full editorial tree: open, my sessions, review queue, ready to publish)
├── Admin [nav]                             /admin   (index card page linking the three below)
│   ├── Users                               /admin/users
│   │   ├── → Invite user
│   │   └── User → Activate · Disable · Roles · Revoke sessions
│   ├── Outlines                            /admin/constitutions
│   │   ├── → New constitution
│   │   └── Constitution → Outline editor   /admin/constitutions/[id]
│   └── Import                              /admin/import   (UI-21)
│       └── Job                             /admin/import/[jobId]
├── API docs                                /api-docs   (GW-2; footer link as well)
└── ● admin@example.org  [admin]
    ├── Editorial
    │   ├── My sessions
    │   ├── Review queue
    │   └── Ready to publish
    ├── Admin
    │   ├── Users
    │   ├── Outlines
    │   └── Import
    ├── API docs
    ├── Account
    └── Sign out
```

Admin-only extras on public pages: `→ Edit outline` on the country page, `→ Verify source` on the version page (opens the source verification form, GOV-5).

---

## Menu section order (all roles)

The menu disclosure always renders sections in this order and skips empty ones:

1. Identity line (email + role badges) — signed-in only
2. Primary destinations `(phone)` — Countries, Search, About, Editor, Admin, API docs as applicable
3. Editorial — editor / reviewer / publisher / admin only
4. Admin — admin only
5. Account, Sign out — signed-in only; **Log in** for anonymous

## Test matrix for `lib/nav.test.ts`

| Principal | Primary bar | Menu sections present |
| --- | --- | --- |
| anonymous | Countries, Search, About | Primary (phone), Log in |
| viewer | Countries, Search, About | Identity, Primary (phone), Account/Sign out |
| editor | + Editor | + Editorial (My sessions, Review queue read-only) |
| reviewer | + Editor | + Editorial (Review queue) |
| publisher | + Editor | + Editorial (Ready to publish) |
| editor+reviewer+publisher | + Editor | + Editorial (all three) |
| admin | + Editor, Admin, API docs | + Editorial (all), Admin (Users, Outlines, Import), API docs |
