# Sprint 67 — CI code coverage and changed-code gate

Authorized on 26 October 2026; tracked in the Sprint 67 Linear milestone
`2e72e41e-a11b-4075-b00f-c98ef79e00ad`. No existing coverage issue was found;
repository instructions prohibit creating issues for untracked maintenance.

Every CI run must publish two headline line-coverage statistics:

1. Whole repository: covered executable production lines / eligible production lines.
2. New code: covered added or changed executable lines / eligible added or changed lines.

New-code coverage must be at least 80%. Overall coverage establishes a baseline;
raising the entire repository to 80% can be scoped after measuring that baseline.
No changed executable lines is an explicit not-applicable result, not 100%.

Coverage applies to Kotlin service/platform production sources, gateway application
TypeScript/JavaScript, existing MCP TypeScript, and Python operational tooling.
Tests, fixtures, generated output, declaration files, third-party code, styles,
SQL migrations, shell scripts, and declarative build/infrastructure configuration
are outside the executable-source denominator. Browser journeys retain their own
acceptance gates; this baseline measures the instrumented service and unit tests.
The published report must state this scope rather than imply all repository text
is executable or covered.

Merge JVM execution probes before generating one JaCoCo report, including platform
classes once. Normalize JavaScript source maps to original tracked sources. Merge
Python observations before reporting. Aggregate source lines by repository path
and line number at the exact tested commit, with covered-if-any semantics. Include
untested files. Reject missing components, stale revisions, incompatible source
hashes, invalid paths, and incomplete reports.

PRs compare the checkout with the merge base of the target branch; main pushes
compare with the previous pushed revision. Publish the exact head/base revisions,
per-component details, two headline statistics, uncovered changed lines, and
machine-readable/browsable artifacts. Gate the unrounded ratio at >=80%.

Close-out requires regression tests for duplicate observations and gate behavior,
independent reviewer/verifier passes and correction loops, affected package checks,
required PR CI, squash merge, main CI, Wiki publication and published media checks.
