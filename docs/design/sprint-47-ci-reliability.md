# Sprint 47 CI reliability

The `CI` workflow cancels superseded runs for the same pull request or branch. Every job has a timeout; the Compose publish journey keeps its 45-minute limit and the full-stack journey keeps its 50-minute limit.

## Failure evidence

- Failed Kotlin service and platform checks upload their check output, test results, and reports, including formatting failures that produce no test report.
- Failed mock, visual, and full-stack Playwright jobs upload their HTML reports and traces from `test-results`.
- Failed Compose journeys upload the last 200 lines of stack logs. The publish journey also captures build, Compose startup, and test output. Artifacts are retained for seven days. They contain test fixtures and diagnostics, not database dumps or environment files.

## Generated fixture drift

The tracked `apps/gateway-web/e2e/fixtures/generated` JSON files come from `cd apps/gateway-web && npm run fixtures:generate`. The frontend job regenerates them and runs `git diff --exit-code -- e2e/fixtures/generated`. A generator change that does not commit its new output therefore fails before the gateway tests. Runtime fixture IDs under `.runtime` are ignored and are not part of this check.

## Required status

`ci-status` waits for every CI job, including the service matrices and full-stack journey. It passes only when each dependency reports `success`; failed, canceled, and skipped jobs fail the status. As of 2026-09-25, `main` has no branch protection or required status checks configured (the GitHub branch-protection endpoint returns 404). Add `ci-status` as the required check only after this workflow has run on `main`.
