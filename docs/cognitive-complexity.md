# Cognitive complexity in CI

The `cognitive-complexity` CI job runs **detekt** for Kotlin and **ESLint with
SonarJS** for TypeScript/JavaScript. Both are free, run locally, and require no
Sonar server, account, or service token. The job is required by `ci-status`.

SonarJS is pinned to **2.0.4**, whose distributed license and cognitive-complexity
rule are LGPLv3. Newer releases examined during setup had a source-available
license despite LGPL package metadata; review the distributed license when
upgrading. No analyzer code is copied into application bundles.

The limit is **15 per function**: 15 passes, 16 fails unless the function is an
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

## Run locally

Use JDK 21 and Node 22, from the repository root:

```sh
npm ci --prefix scripts/complexity
npm test --prefix scripts/complexity
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

Kotlin uses detekt's native baseline identifiers (file, declaration, and
signature). An existing baseline entry continues to suppress that function when
its body changes; this is a gate on new findings, not a guarantee against
increasing complexity in an already-baselined function. Review the full report
when editing these functions. TypeScript exceptions are tied to function token
fingerprints (ignoring whitespace and comments), so code changes to an over-limit
function require reducing its complexity or explicitly reviewing a new exception.

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
