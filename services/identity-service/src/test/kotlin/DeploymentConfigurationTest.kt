import com.constitutionatlas.identity.setup.DeploymentConfiguration
import com.constitutionatlas.identity.setup.SetupState
import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows
import org.springframework.mock.env.MockEnvironment

class DeploymentConfigurationTest {
    private fun environment() = MockEnvironment().apply { setActiveProfiles("local-stack") }

    @Test
    fun allWebsiteLanguagesAreTheDefaultAndInvalidPolicyIsRejected() {
        val config = DeploymentConfiguration(environment(), jacksonObjectMapper())
        val state = SetupState(null, null, false, false, false, emptyList(), "")
        check(config.languages(state).enabled == config.supported)
        assertThrows<IllegalArgumentException> { config.languages(state.copy(enabledLanguages = listOf("unsupported"))) }
        assertThrows<IllegalArgumentException> { config.languages(state.copy(enabledLanguages = listOf("de"), defaultLanguage = "en")) }
    }

    @Test
    fun explicitEnvironmentLanguagesOverrideSavedConfiguration() {
        val env = environment().withProperty("SITE_LANGUAGES", "de").withProperty("SITE_DEFAULT_LANGUAGE", "de")
        val config = DeploymentConfiguration(env, jacksonObjectMapper())
        val state = SetupState(null, null, false, false, false, listOf("en"), "en")
        check(config.languages(state).enabled == listOf("de") && config.languages(state).managed)
    }

    @Test
    fun opaqueSmtpPasswordPreservesWhitespace() {
        val config = DeploymentConfiguration(environment().withProperty("SMTP_PASSWORD", " secret ").withProperty("SMTP_HOST", " mail.example.org "), jacksonObjectMapper())
        check(config.value("SMTP_PASSWORD") == " secret ")
        check(config.value("SMTP_HOST") == "mail.example.org")
        check(DeploymentConfiguration(environment().withProperty("SMTP_PASSWORD", "  "), jacksonObjectMapper()).value("SMTP_PASSWORD") == null)
    }

    @Test
    fun productionRejectsLocalTransportAndFixtures() {
        val env = environment().apply { setActiveProfiles("production") }
        assertThrows<IllegalStateException> { DeploymentConfiguration(env, jacksonObjectMapper()).validateTransport() }
        env.setProperty("TLS_MODE", "external-proxy")
        env.setProperty("PUBLIC_BASE_URL", "https://atlas.example.org")
        env.setProperty("SETUP_FIXTURE_COMPLETE", "true")
        assertThrows<IllegalStateException> { DeploymentConfiguration(env, jacksonObjectMapper()).validateTransport() }
        env.setProperty("SETUP_FIXTURE_COMPLETE", "false")
        DeploymentConfiguration(env, jacksonObjectMapper()).validateTransport()
    }
}
