import com.constitutionatlas.ingestion.client.DownstreamAuth
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Test

class DownstreamAuthTest {
    @Test
    fun `nested credential scopes restore the caller even after failure`() {
        DownstreamAuth.withAuthorization("Bearer editor") {
            assertThrows(IllegalStateException::class.java) {
                DownstreamAuth.withAuthorization("Bearer publisher") {
                    assertEquals("Bearer publisher", DownstreamAuth.header())
                    error("downstream failed")
                }
            }
            assertEquals("Bearer editor", DownstreamAuth.header())
            DownstreamAuth.withAuthorization(null) { assertNull(DownstreamAuth.header()) }
            assertEquals("Bearer editor", DownstreamAuth.header())
        }
        assertNull(DownstreamAuth.header())
    }
}
