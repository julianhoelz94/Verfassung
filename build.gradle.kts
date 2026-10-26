plugins {
    jacoco
}

repositories {
    mavenCentral()
}

jacoco {
    toolVersion = "0.8.16"
}

// Only reporting happens here. Services remain independent Gradle builds.
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
