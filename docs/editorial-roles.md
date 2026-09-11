# Editorial roles (IDN-8)

Identity owns users and roles. Editor-service enforces capabilities on each command. The gateway hides buttons that the current user cannot use; that is not authorization.

| Role | Open/save/submit | Approve review | Publish article | Draft a change record | Publish/withdraw change record |
| --- | --- | --- | --- | --- | --- |
| `editor` | yes | no | no | yes | no |
| `reviewer` | no | yes | no | no | no |
| `publisher` | no | no | yes | no (unless also editor) | yes |
| `admin` | yes | yes | yes | yes | yes |
| `viewer` | no | no | no | no | no |

Flow: `open` → save → submit (`reviewing`) → approve (`approved`) → publish (`published`).

Publish (ED-4) copies the session’s version onto a **new** catalog version, applies drafts only to that copy, publishes the successor, then requests `POST /reindex`. The source version’s public bytes do not change. A successor is not automatically a public law (ADR 0004 / ADR 0005): hop kind and change-record identity land in CAT-6 / AMD-11 / ED-7. Editorial hops hang off the legal version they correct; public chips are legal identities.

Local seed (`identity.seed.mode`: `create-only` on local-stack/ci/testing, `off` in production; `LOCAL_*` / `CI_*` / `TEST_*` env). Ordinary startup never resets an existing password hash. Production rejects demo emails and `change-me` passwords.

- `local-editor@example.local` — `editor` + `reviewer` + `publisher` (one-login path)
- `local-reviewer@example.local` — `reviewer` only
- `local-publisher@example.local` — `publisher` only
- `local-admin@example.local` — `admin`
- `local-viewer@example.local` — `viewer` (no editor API access)
