import com.constitutionatlas.editor.client.RestIdentityClient
import com.fasterxml.jackson.databind.ObjectMapper
import com.sun.net.httpserver.HttpServer
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import java.io.File
import java.net.InetSocketAddress

class RestIdentityClientTest {
    @Test
    fun authenticateReadsIdentityMeContract() {
        val contract = File("../../apps/gateway-web/lib/contracts/identity-me.json").readText()
        val expected = ObjectMapper().readTree(contract)
        val server = HttpServer.create(InetSocketAddress("127.0.0.1", 0), 0)
        server.createContext("/me") { exchange ->
            val authorized = exchange.requestHeaders.getFirst("Authorization") == "Bearer test-token"
            val status = if (authorized) 200 else 401
            val body = if (authorized) contract else """{"error":"Invalid or expired session"}"""
            val bytes = body.toByteArray()
            exchange.sendResponseHeaders(status, bytes.size.toLong())
            exchange.responseBody.use { it.write(bytes) }
        }
        server.start()
        try {
            val client = RestIdentityClient("http://127.0.0.1:${server.address.port}")
            val actor = client.authenticate("Bearer test-token")
            assertThat(actor.email).isEqualTo(expected.get("email").asText())
            assertThat(actor.roles).containsExactly("editor", "publisher", "reviewer")
        } finally {
            server.stop(0)
        }
    }
}
