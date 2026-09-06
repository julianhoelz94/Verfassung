import com.constitutionatlas.identity.config.IdentityMfaProperties
import com.constitutionatlas.identity.config.IdentitySeedProperties
import com.constitutionatlas.identity.service.ProductionIdentityGuard
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows
import org.springframework.boot.DefaultApplicationArguments

class ProductionIdentityGuardTest {
    private val productionMfa = IdentityMfaProperties(encryptionKey = "production-mfa-key")

    @Test
    fun allowsOffWithBlankCredentials() {
        ProductionIdentityGuard(IdentitySeedProperties(mode = "off"), productionMfa).run(DefaultApplicationArguments())
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
    fun rejectsDemoEmails() {
        assertThrows<IllegalStateException> {
            ProductionIdentityGuard(
                IdentitySeedProperties(mode = "off", editorEmail = "local-editor@example.local"),
                productionMfa,
            ).run(DefaultApplicationArguments())
        }
    }

    @Test
    fun rejectsDemoPasswords() {
        assertThrows<IllegalStateException> {
            ProductionIdentityGuard(
                IdentitySeedProperties(mode = "off", editorPassword = "change-me"),
                productionMfa,
            ).run(DefaultApplicationArguments())
        }
    }
}
