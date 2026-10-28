plugins {
    jacoco
}

repositories {
    mavenCentral()
}

// Run the CLI in its own JVM: services remain independent builds, and detekt's
// Kotlin compiler does not share Gradle's embedded Kotlin classpath.
val detektCli = configurations.create("detektCli")
dependencies {
    add(detektCli.name, "io.gitlab.arturbosch.detekt:detekt-cli:1.23.8:all") {
        isTransitive = false
    }
}

fun JavaExec.configureCognitiveComplexity() {
    group = "verification"
    classpath = detektCli
    mainClass.set("io.gitlab.arturbosch.detekt.cli.Main")
    workingDir = rootDir
    args(
        "--input", "services",
        "--includes", "**/src/**/*.kt",
        "--excludes", "**/build/**,**/generated/**,**/node_modules/**",
        "--config", "config/detekt/cognitive-complexity.yml",
        "--base-path", rootDir.absolutePath,
    )
}

val cognitiveComplexityReport = tasks.register<JavaExec>("cognitiveComplexityReport") {
    description = "Report all Kotlin cognitive complexity findings, including accepted debt."
    configureCognitiveComplexity()
    args(
        "--max-issues", Int.MAX_VALUE.toString(),
        "--report", "xml:build/reports/complexity/kotlin/all.xml",
        "--report", "html:build/reports/complexity/kotlin/all.html",
    )
}

/** Runs the Kotlin score ratchet and retains its diagnostics when Gradle rejects a regression. */
fun Task.checkKotlinScores(vararg arguments: String) {
    val check = project.providers.exec {
        commandLine(listOf("python3", "scripts/complexity/kotlin_scores.py") + arguments)
        isIgnoreExitValue = true
    }
    logger.lifecycle(check.standardOutput.asText.get().trim())
    val errors = check.standardError.asText.get().trim()
    if (errors.isNotEmpty()) logger.error(errors)
    check.result.get().assertNormalExitValue()
}

tasks.register<JavaExec>("cognitiveComplexity") {
    description = "Reject new or increased Kotlin cognitive complexity above 20."
    dependsOn(cognitiveComplexityReport)
    configureCognitiveComplexity()
    args(
        "--baseline", "config/detekt/cognitive-complexity-baseline.xml",
        "--max-issues", "0",
        "--report", "xml:build/reports/complexity/kotlin/detekt.xml",
        "--report", "html:build/reports/complexity/kotlin/detekt.html",
    )
    // The native baseline follows declaration signatures. Compare full scores
    // as well so editing an exempted function cannot silently increase its debt.
    doLast {
        checkKotlinScores()
    }
}

tasks.register<JavaExec>("cognitiveComplexityBaseline") {
    description = "Explicitly regenerate reviewed Kotlin complexity exceptions; never run in CI."
    configureCognitiveComplexity()
    args("--baseline", "config/detekt/cognitive-complexity-baseline.xml", "--create-baseline")
    dependsOn(cognitiveComplexityReport)
    doLast {
        checkKotlinScores("--baseline")
    }
}

jacoco {
    toolVersion = "0.8.16"
}

// Repository-wide reporting happens here. Services remain independent Gradle builds.
tasks.register<JacocoReport>("repositoryCoverage") {
    executionData(fileTree("coverage/inputs") { include("*/test.exec") })
    classDirectories.setFrom(
        file("coverage/inputs").listFiles().orEmpty().map { it.resolve("classes") },
    )
    sourceDirectories.setFrom(
        file("services").listFiles().orEmpty().map { it.resolve("src/main/kotlin") },
    )
    reports {
        xml.required.set(true)
        xml.outputLocation.set(file("coverage/jvm.xml"))
        html.required.set(true)
        html.outputLocation.set(file("coverage/jvm-html"))
    }
}

tasks.register("helpServices") {
    doLast {
        logger.lifecycle(
            "Not a multi-module build. Use ./gradlew -p services/<name> <task> " +
                "or cd services/<name> && ./gradlew <task>.",
        )
    }
}
