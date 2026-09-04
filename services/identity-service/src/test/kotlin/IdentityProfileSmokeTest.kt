import org.junit.jupiter.api.Test

class IdentityProfileSmokeTest {
    @Test
    fun allFourProfilesDeclareSeedModeAndSessionTtl() {
        val expected =
            mapOf(
                "local-stack" to Triple("create-only", "30m", "24h"),
                "ci" to Triple("create-only", "30m", "12h"),
                "testing" to Triple("create-only", "15m", "8h"),
                "production" to Triple("off", "15m", "12h"),
            )
        expected.forEach { (profile, spec) ->
            val text = javaClass.getResource("/application-$profile.yml")!!.readText()
            check(text.contains("mode: ${spec.first}")) { "$profile missing seed mode ${spec.first}" }
            check(text.contains("idle-timeout: ${spec.second}")) { "$profile missing idle ${spec.second}" }
            check(text.contains("absolute-timeout: ${spec.third}")) { "$profile missing absolute ${spec.third}" }
        }
    }
}
