tasks.register("helpServices") {
    doLast {
        logger.lifecycle(
            "Not a multi-module build. Use ./gradlew -p services/<name> <task> " +
                "or cd services/<name> && ./gradlew <task>.",
        )
    }
}
