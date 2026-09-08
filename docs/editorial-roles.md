# Editorial roles (IDN-8)

Identity owns users and roles. Editor-service enforces capabilities on each command. The gateway hides buttons that the current user cannot use; that is not authorization.

| Role | Open/save/submit | Approve review | Publish |
| --- | --- | --- | --- |
| `editor` | yes | no | no |
| `reviewer` | no | yes | no |
| `publisher` | no | no | yes |
| `admin` | yes | yes | yes |
| `viewer` | no | no | no |

Flow: `open` → save → submit (`reviewing`) → approve (`approved`) → publish (`published`).

Publish (ED-4) copies the session’s version onto a **new** catalog version, applies drafts only to that copy, publishes the successor, then requests `POST /reindex`. The source version’s public bytes do not change.

Local seed (`identity.seed.mode`: `create-only` on local-stack/ci/testing, `off` in production; `LOCAL_*` / `CI_*` / `TEST_*` env). Ordinary startup never resets an existing password hash. Production rejects demo emails and `change-me` passwords.

- `local-editor@example.local` — `editor` + `reviewer` + `publisher` (one-login path)
- `local-reviewer@example.local` — `reviewer` only
- `local-publisher@example.local` — `publisher` only
- `local-admin@example.local` — `admin`
- `local-viewer@example.local` — `viewer` (no editor API access)
