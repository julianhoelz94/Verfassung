# Login stories

These stories use the five accounts seeded by the `local-stack` identity profile. The Playwright implementation is `login-stories.spec.ts`; CI runs it through `npm run test:e2e`.

| User | Story | Expected result |
| --- | --- | --- |
| Editor | Sign in with password, complete authenticator challenge, sign out | Editor opens; editorial navigation is available; admin navigation is absent |
| Reviewer | Sign in with password, sign out | Editor opens with review access; admin navigation is absent |
| Publisher | Sign in with password, complete authenticator challenge, sign out | Editor opens with publishing access; admin navigation is absent |
| Admin | Sign in with password, complete authenticator challenge, sign out | Editor opens; admin navigation is available |
| Viewer | Sign in with password, sign out | Public home opens; editorial and admin navigation are absent |

Each story also verifies the account identity and that `/account` redirects to login after sign-out. A rejected password must leave the visitor signed out.

The browser mock uses `123456` only as a deterministic test authenticator code. A real local stack uses a time-based code derived from `IDENTITY_SEED_TOTP_SECRET`, defaulting to `CAATLASMFASEED22` when that variable is absent. `123456` does not work there. The seed mode is `create-only`, so changing a configured password after the user exists does not change the stored password.
