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

Kotlin also has a **maximum of 100 cognitive-complexity points per file**:
100 passes and 101 fails unless covered by reviewed existing debt. This uses
detekt's own file metric through the repository's `CognitiveComplexFile` rule,
including named functions below the per-function limit. Nested function bodies
are counted by detekt's enclosing traversal without summing their score twice.
Classes, objects, and top-level functions in one file share its budget.
This follows detekt's named-function metric; constructor/property initializers
and property accessors outside those functions are not scored separately.

After synchronizing with `main` at `4d07d6a` and cleaning up import validation,
export read-back and shared hierarchical diffing, the file baseline contains five
production files: `StructuredDraftEngine` (189), `EditorService` (179),
`AmendmentService` (116), `CatalogWriteService` (116), and `OrderedContentService`
(102). The completed packages and their focused helpers meet both budgets.
These are measured findings, not automatic exemptions for future files with
similar names. All editor code is now included in cleanup and normal CI gates.

Extracting helpers within one file does not remove their control flow from this
budget. Reducing nesting can still legitimately lower the total. When a file
carries several responsibilities, move cohesive behavior to
named domain classes or modules, for example a translation request factory or
response parser. Utility files have the same budget; gathering unrelated helpers
in one shared file would create another hotspot. The function limit remains 20.

## Scope and reports

- Kotlin: `services/**/src/**/*.kt`, including the shared platform and tests.
- TypeScript/JavaScript: handwritten sources in `apps/gateway-web` and
  `services/mcp-server`, including tests and tooling.
- Dependency directories, build output, and generated sources are excluded.

CI uploads the `cognitive-complexity` artifact even when a check fails. Reports
under `build/reports/complexity/` show locations and scores, including existing
debt. Kotlin's `all.html` / `all.xml` show all over-limit functions and files;
`detekt.html` / `detekt.xml` show unbaselined findings that fail the gate.
TypeScript's `summary.md` distinguishes baseline exceptions from new violations;
`summary.json` includes all analyzed function scores.

There are no construction exemptions. `EditorPage` in
`apps/gateway-web/app/editor/page.tsx` is included with its current score of 165
as ordinary existing debt. Its reviewed token fingerprint must remain unchanged;
editing that over-limit function fails the same gate as other TypeScript code.
Editor-service methods and files retain their normal Kotlin score caps.

## Run locally

Use JDK 21, Node 22, and Python 3, from the repository root:

```sh
npm ci --prefix scripts/complexity
npm test --prefix scripts/complexity
python3 -m unittest discover -s scripts/complexity -p 'test_kotlin_scores.py'
python3 scripts/complexity/test_kotlin.py
python3 scripts/complexity/test_kotlin_files.py
./gradlew cognitiveComplexity
npm run check --prefix scripts/complexity
```

No service compilation, database, or Docker stack is needed. The complexity npm
package is separate from application dependencies and does not change gateway
lint rules or production bundles.

Gradle compiles the small custom file rule using the compiler bundled with the
pinned detekt CLI, packages its service provider, and supplies that JAR to detekt.
This keeps the extension compatible with the analyzer's API independently of the
application Kotlin version. Rule sources and KDoc are under `tools/detekt-rules/`.

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

The same baseline records file maxima. A new file above 100 fails; an existing
over-budget file may retain or reduce its reviewed score, but an increase fails
even if its native file finding is baselined. File identity uses the full
repository-relative path. CI never grants new exceptions automatically.

TypeScript exceptions are tied to function token
fingerprints (ignoring whitespace and comments), so code changes to an over-limit
function require reducing its complexity or explicitly reviewing a new exception.
Editor functions follow these same rules; no page has a special bypass.

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
