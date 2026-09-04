import com.constitutionatlas.identity.config.IdentitySeedProperties
import com.constitutionatlas.identity.service.ProductionIdentityGuard
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows
import org.springframework.boot.DefaultApplicationArguments

class ProductionIdentityGuardTest {
    @Test
    fun allowsOffWithBlankCredentials() {
        ProductionIdentityGuard(IdentitySeedProperties(mode = "off")).run(DefaultApplicationArguments())
    }

    @Test
    fun rejectsNonOffSeedMode() {
        assertThrows<IllegalStateException> {
            ProductionIdentityGuard(IdentitySeedProperties(mode = "create-only")).run(DefaultApplicationArguments())
        }
    }

    @Test
    fun rejectsDemoEmails() {
        assertThrows<IllegalStateException> {
            ProductionIdentityGuard(
                IdentitySeedProperties(mode = "off", editorEmail = "local-editor@example.local"),
            ).run(DefaultApplicationArguments())
        }
    }

    @Test
    fun rejectsDemoPasswords() {
        assertThrows<IllegalStateException> {
            ProductionIdentityGuard(
                IdentitySeedProperties(mode = "off", editorPassword = "change-me"),
            ).run(DefaultApplicationArguments())
        }
    }
}
