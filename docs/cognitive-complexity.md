# Cognitive complexity in CI

The `cognitive-complexity` CI job runs **detekt** for Kotlin and **ESLint with
SonarJS** for TypeScript/JavaScript. Both are free, run locally, and require no
Sonar server, account, or service token. The job is required by `ci-status`.

SonarJS is pinned to **2.0.4**, whose distributed license and cognitive-complexity
rule are LGPLv3. Newer releases examined during setup had a source-available
license despite LGPL package metadata; review the distributed license when
upgrading. No analyzer code is copied into application bundles.

The limit is **20 per function**: 20 passes, 21 fails unless the function is an
existing, reviewed baseline exception. Cognitive complexity measures control-flow
and nesting difficulty, not runtime cost or overall design quality. Kotlin and
TypeScript scores use different implementations and are not directly comparable.
Kotlin reports list over-limit functions. The TypeScript JSON report includes
scores for every analyzed function, including those below the limit.

## Scope and reports

- Kotlin: `services/**/src/**/*.kt`, including the shared platform and tests.
- TypeScript/JavaScript: handwritten sources in `apps/gateway-web` and
  `services/mcp-server`, including tests and tooling.
- Dependency directories, build output, and generated sources are excluded.

CI uploads the `cognitive-complexity` artifact even when a check fails. Reports
under `build/reports/complexity/` show locations and scores, including existing
debt. Kotlin's `all.html` / `all.xml` show all over-limit functions;
`detekt.html` / `detekt.xml` show unbaselined findings that fail the gate.
TypeScript's `summary.md` distinguishes baseline exceptions from new violations;
`summary.json` includes all analyzed function scores.

`EditorPage` in `apps/gateway-web/app/editor/page.tsx` is temporarily deferred
while the page is under construction. Its current score remains in reports with
status `deferred`; body changes do not invalidate that specific exemption. Other
functions in the file and other editor files remain subject to the normal gate.
Remove this named exemption when construction finishes.

## Run locally

Use JDK 21 and Node 22, from the repository root:

```sh
npm ci --prefix scripts/complexity
npm test --prefix scripts/complexity
python3 -m unittest discover -s scripts/complexity -p 'test_kotlin_scores.py'
python3 scripts/complexity/test_kotlin.py
./gradlew cognitiveComplexity
npm run check --prefix scripts/complexity
```

No service compilation, database, or Docker stack is needed. The complexity npm
package is separate from application dependencies and does not change gateway
lint rules or production bundles.

These checks supplement compilation. In particular, detekt's standalone CLI can
accept malformed Kotlin, so it is not a syntax-validation replacement. The
existing required backend and platform compilation/test jobs remain responsible
for rejecting invalid Kotlin; TypeScript parser errors fail the complexity check.

## Existing debt and cleanup

The initial baselines accept existing violations so adopting the check does not
require an unrelated application rewrite. CI **never regenerates baselines**.

Kotlin combines detekt's native identifiers (file, declaration, and signature)
with reviewed maximum scores in `config/detekt/cognitive-complexity-scores.json`.
The native baseline accepts existing declarations; the score check rejects a
function whose current score exceeds its reviewed maximum, including body changes
that the native baseline alone would suppress. New unbaselined functions above
20 also fail. Ambiguous overloaded findings fail for explicit review.

TypeScript exceptions are tied to function token
fingerprints (ignoring whitespace and comments), so code changes to an over-limit
function require reducing its complexity or explicitly reviewing a new exception.
The named unfinished editor page is the sole construction exemption.

Prefer early returns, named domain operations, smaller validation steps, and
components with focused responsibilities. Preserve behavior and add regression
tests around the actual contracts; extracting arbitrary helpers just to lower a
number does not necessarily improve readability.

Baseline changes must be reviewed like code. After a deliberate cleanup or
approved exception, explicitly regenerate and inspect the diff:

```sh
./gradlew cognitiveComplexityBaseline
npm run baseline --prefix scripts/complexity
git diff -- config/detekt scripts/complexity
```

Do not use these commands to make a failing CI check green without reviewing the
newly accepted debt. See [the cleanup estimate](complexity-cleanup-estimate.md)
for the initial measured inventory and an effort range.
