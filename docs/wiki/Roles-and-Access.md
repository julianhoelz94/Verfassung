# Roles and access

Roles grant capabilities to an account. They are **additive**: an account with Editor and Reviewer can both prepare and approve work. Publisher does not automatically include Editor or Reviewer. Admin includes all three editorial capabilities and administration.

The interface calls the `viewer` role **Reader**. New self-registered accounts start with this role. Reading published content does not require an editorial role. Whether visitors must sign in to read depends on the site's anonymous-browsing policy.

| Role | Access granted |
| --- | --- |
| **Reader** (`viewer`) | Read published constitutional texts, amendments, lifecycle events, Wiki pages and publicly linked documents; search and compare published versions. Manage the account's own preferences and security. No editorial or administrative commands. |
| **Editor** (`editor`) | Create, save and submit constitutional text drafts; prepare imports; create and revise amendment drafts and passage notes; edit Wiki drafts; create and revise documents. Add or update amendment-wide and individual-change commentary and materials. Cannot approve or publish constitutional text solely with this role. |
| **Reviewer** (`reviewer`) | Inspect editorial work and revision history; approve submitted text drafts; approve or reject prepared imports. Review access does not grant draft writing, publication, document writing or lifecycle-event editing. |
| **Publisher** (`publisher`) | Publish approved constitutional text and imports; publish or withdraw amendment records; publish saved Wiki revisions. Record constitution/provision lifecycle events and revise lifecycle evidence; manage lifecycle-event commentary and materials. Does not grant text-draft writing or approval. |
| **Admin** (`admin`) | All editorial capabilities, plus account invitations, role assignment, account enablement/disablement, service-token administration, constitution configuration, site settings, access policy, deployment setup and operator/legal-page management. |

## Capability matrix

Each column below assumes that the account holds **only that role**. A combined account receives the union of its roles' capabilities. Required workflow state, ownership, validation and second-factor checks still apply.

| Action | Reader | Editor | Reviewer | Publisher | Admin |
| --- | :---: | :---: | :---: | :---: | :---: |
| Read published content and comparisons | ✓ | ✓ | ✓ | ✓ | ✓ |
| Enter editorial workspaces and inspect history | — | ✓ | ✓ | ✓ | ✓ |
| Open/save/submit a constitutional text draft | — | ✓ | — | — | ✓ |
| Approve submitted text | — | — | ✓ | — | ✓ |
| Publish approved text | — | — | — | ✓ | ✓ |
| Prepare an import | — | ✓ | — | — | ✓ |
| Approve/reject a prepared import | — | — | ✓ | — | ✓ |
| Publish an approved import | — | — | — | ✓ | ✓ |
| Create/revise amendment drafts and passage notes | — | ✓ | — | — | ✓ |
| Publish/withdraw amendment records | — | — | — | ✓ | ✓ |
| Manage amendment/change commentary and materials | — | ✓ | — | — | ✓ |
| Save a Wiki draft | — | ✓ | — | — | ✓ |
| Publish a saved Wiki revision | — | — | — | ✓ | ✓ |
| Create/revise documents in the library | — | ✓ | — | — | ✓ |
| Record lifecycle events and revise their evidence | — | — | — | ✓ | ✓ |
| Manage lifecycle commentary and materials | — | — | — | ✓ | ✓ |
| Manage users, roles and site settings | — | — | — | — | ✓ |

Document-library writing requires Editor or Admin. Publisher and Reviewer can inspect the library. Publisher can add and revise materials through a lifecycle event's own controls; this does not grant general library writing. Document-library access does not by itself permit changing every document link. Published amendment evidence remains pinned to its revision; independently maintained commentary uses its own revisioned links. Lifecycle evidence revisions preserve the original event's legal date and type.

## How roles combine

An **Editor + Reviewer** can prepare and approve text but needs a Publisher to publish it. A **Reviewer + Publisher** can approve and publish submitted work, but needs Editor as well to write a text draft. An **Editor + Reviewer + Publisher** can complete the whole editorial sequence with one account. Separate approval and publication decisions remain required; a second account is not mandatory.

These are application roles rather than a seniority hierarchy. Publisher's lifecycle access follows from its responsibility for public legal-status records. It does not imply permission to perform every Editor action. Admin is the exception because it grants all editorial capabilities.

## Permission enforcement and account security

Editor links appear only for roles allowed to use them. A Reviewer or Publisher may see an **Open workspace** link to an amendment without gaining draft-editing rights. A lifecycle editor link is available to Publisher and Admin. Opening a URL directly does not grant additional access: the owning API checks each command.

Roles are necessary but may not be sufficient. Draft ownership, workflow status, immutable published revisions and input validation also constrain actions. Publishers and administrators must use a second factor for protected operations; publication and other sensitive actions can require a fresh MFA check. Import credentials require a recent second-factor check even for an Editor.

Administrators assign roles. Changing roles or disabling an account revokes that account's sessions and personal MCP/OAuth credentials; the user must sign in and reconnect affected clients. Service tokens have separate roles/scopes and revocation controls. A narrowly scoped automation credential does not grant an interactive account a broader role.

[[Accounts and security|Account-Guide]] · [[Deutsch|Roles-and-Access-de]]
