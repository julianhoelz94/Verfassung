import com.constitutionatlas.identity.config.IdentityMailProperties
import com.constitutionatlas.identity.config.IdentityMfaProperties
import com.constitutionatlas.identity.config.IdentitySeedProperties
import com.constitutionatlas.identity.service.ProductionIdentityGuard
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows
import org.springframework.boot.DefaultApplicationArguments
import java.util.Base64

class ProductionIdentityGuardTest {
    private val productionMfa = IdentityMfaProperties(encryptionKey = PRODUCTION_KEY)
    private val productionMail =
        IdentityMailProperties(
            from = "noreply@verfassungen.de",
            publicBaseUrl = "https://verfassungen.de",
            host = "smtp.example",
        )

    @Test
    fun allowsOffWithBlankCredentials() {
        ProductionIdentityGuard(IdentitySeedProperties(mode = "off"), productionMfa, mailProperties = productionMail)
            .run(DefaultApplicationArguments())
    }

    @Test
    fun rejectsNonOffSeedMode() {
        assertThrows<IllegalStateException> {
            ProductionIdentityGuard(IdentitySeedProperties(mode = "create-only"), productionMfa).run(DefaultApplicationArguments())
        }
    }

    @Test
    fun rejectsDefaultMfaKey() {
        assertThrows<IllegalStateException> {
            ProductionIdentityGuard(IdentitySeedProperties(mode = "off")).run(DefaultApplicationArguments())
        }
    }

    @Test
    fun rejectsPassphraseMfaKey() {
        assertThrows<IllegalStateException> {
            ProductionIdentityGuard(
                IdentitySeedProperties(mode = "off"),
                IdentityMfaProperties(encryptionKey = "production-mfa-key"),
            ).run(DefaultApplicationArguments())
        }
    }

    @Test
    fun rejectsLoggedResetTokens() {
        assertThrows<IllegalStateException> {
            ProductionIdentityGuard(IdentitySeedProperties(mode = "off"), productionMfa, logResetToken = true)
                .run(DefaultApplicationArguments())
        }
    }

    @Test
    fun rejectsMissingSmtp() {
        assertThrows<IllegalStateException> {
            ProductionIdentityGuard(
                IdentitySeedProperties(mode = "off"),
                productionMfa,
                mailProperties = IdentityMailProperties(),
            ).run(DefaultApplicationArguments())
        }
    }

    @Test
    fun rejectsDemoEmails() {
        assertThrows<IllegalStateException> {
            ProductionIdentityGuard(
                IdentitySeedProperties(mode = "off", editorEmail = "local-editor@example.local"),
                productionMfa,
                mailProperties = productionMail,
            ).run(DefaultApplicationArguments())
        }
    }

    @Test
    fun rejectsDemoPasswords() {
        assertThrows<IllegalStateException> {
            ProductionIdentityGuard(
                IdentitySeedProperties(mode = "off", editorPassword = "change-me"),
                productionMfa,
                mailProperties = productionMail,
            ).run(DefaultApplicationArguments())
        }
    }

    @Test
    fun rejectsSeededServiceToken() {
        assertThrows<IllegalStateException> {
            ProductionIdentityGuard(
                IdentitySeedProperties(mode = "off", serviceToken = "machine-token"),
                productionMfa,
                mailProperties = productionMail,
            ).run(DefaultApplicationArguments())
        }
    }

    companion object {
        private val PRODUCTION_KEY = Base64.getEncoder().encodeToString(ByteArray(32) { 7 })
    }
}
