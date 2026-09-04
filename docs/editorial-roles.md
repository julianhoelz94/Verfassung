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

Publish (QLT-5) patches existing public articles in place so content-tree children stay intact, then requests `POST /reindex` on search. Set `EDITOR_PUBLISH_PUBLIC=false` to keep the old audit-only publish.

Local seed (`identity.seed.*` / `LOCAL_*` env):

- `local-editor@example.local` — `editor` + `reviewer` + `publisher` (one-login path)
- `local-reviewer@example.local` — `reviewer` only
- `local-publisher@example.local` — `publisher` only
- `local-admin@example.local` — `admin`
- `local-viewer@example.local` — `viewer` (no editor API access)
