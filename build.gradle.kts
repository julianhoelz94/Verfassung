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

tasks.register<JavaExec>("cognitiveComplexity") {
    description = "Reject new Kotlin functions with cognitive complexity above 15."
    dependsOn(cognitiveComplexityReport)
    configureCognitiveComplexity()
    args(
        "--baseline", "config/detekt/cognitive-complexity-baseline.xml",
        "--max-issues", "0",
        "--report", "xml:build/reports/complexity/kotlin/detekt.xml",
        "--report", "html:build/reports/complexity/kotlin/detekt.html",
    )
}

tasks.register<JavaExec>("cognitiveComplexityBaseline") {
    description = "Explicitly regenerate reviewed Kotlin complexity exceptions; never run in CI."
    configureCognitiveComplexity()
    args("--baseline", "config/detekt/cognitive-complexity-baseline.xml", "--create-baseline")
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
