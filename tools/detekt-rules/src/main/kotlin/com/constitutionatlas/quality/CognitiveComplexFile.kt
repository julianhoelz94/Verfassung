package com.constitutionatlas.quality

import io.github.detekt.metrics.CognitiveComplexity
import io.gitlab.arturbosch.detekt.api.CodeSmell
import io.gitlab.arturbosch.detekt.api.Config
import io.gitlab.arturbosch.detekt.api.Debt
import io.gitlab.arturbosch.detekt.api.Entity
import io.gitlab.arturbosch.detekt.api.Issue
import io.gitlab.arturbosch.detekt.api.Rule
import io.gitlab.arturbosch.detekt.api.RuleSet
import io.gitlab.arturbosch.detekt.api.RuleSetProvider
import io.gitlab.arturbosch.detekt.api.Severity
import org.jetbrains.kotlin.psi.KtFile

/**
 * Limits a Kotlin file's aggregate cognitive complexity using detekt's own metric.
 *
 * Every contained named function contributes, including functions below the method
 * threshold. Calculating once for the whole file preserves detekt's treatment of
 * local functions and lambda nesting without counting local functions twice.
 * Remaining control flow still counts when moved into helpers in the same file;
 * reducing nesting can legitimately reduce the aggregate score.
 * The configured maximum is inclusive: a score of 100 passes a maximum of 100.
 */
class CognitiveComplexFile(config: Config) : Rule(config) {
    override val issue = Issue(
        "CognitiveComplexFile",
        Severity.Maintainability,
        "A Kotlin file should have a focused responsibility and a bounded cognitive complexity.",
        Debt.TWENTY_MINS,
    )

    /** Reports one file-level finding when its complete metric exceeds the configured maximum. */
    override fun visitKtFile(file: KtFile) {
        val maximum = valueOrNull<Any>("maximum") ?: 100
        require(maximum is Int && maximum >= 0) {
            "CognitiveComplexFile maximum must be a nonnegative integer"
        }
        val score = CognitiveComplexity.calculate(file)
        if (score > maximum) {
            report(
                CodeSmell(
                    issue,
                    Entity.atPackageOrFirstDecl(file),
                    "The file has cognitive complexity $score; maximum is $maximum.",
                ),
            )
        }
    }
}

/** Makes the repository's file-complexity rule discoverable through detekt's plugin SPI. */
class RepositoryComplexityProvider : RuleSetProvider {
    override val ruleSetId = "repository-complexity"

    /** Creates a fresh rule instance for each analysis using its rule-set configuration. */
    override fun instance(config: Config) = RuleSet(ruleSetId, listOf(CognitiveComplexFile(config)))
}
