import com.constitutionatlas.identity.crypto.encodeRequired
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder
import org.springframework.security.crypto.password.PasswordEncoder

class PasswordHashesTest {
    @Test
    fun `stored password hashes remain compatible with bcrypt verification`() {
        val encoder = BCryptPasswordEncoder()
        val hash = encoder.encodeRequired("supported-password")
        assertTrue(encoder.matches("supported-password", hash))
    }

    @Test
    fun `encoder refusing to create a hash fails closed`() {
        val encoder = object : PasswordEncoder {
            override fun encode(rawPassword: CharSequence?): String? = null
            override fun matches(rawPassword: CharSequence?, encodedPassword: String?): Boolean = false
        }
        assertThrows(IllegalStateException::class.java) { encoder.encodeRequired("supported-password") }
    }
}
