import com.constitutionatlas.document.DocumentServiceApplication
import com.constitutionatlas.platform.Actor
import com.constitutionatlas.platform.IdentityClient
import com.constitutionatlas.platform.UnauthorizedException
import com.fasterxml.jackson.databind.ObjectMapper
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.mockito.Mockito
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.boot.test.mock.mockito.MockBean
import org.springframework.http.MediaType
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.test.context.DynamicPropertyRegistry
import org.springframework.test.context.DynamicPropertySource
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.get
import org.springframework.test.web.servlet.post
import org.springframework.test.web.servlet.put
import org.testcontainers.containers.PostgreSQLContainer
import org.testcontainers.junit.jupiter.Container
import org.testcontainers.junit.jupiter.Testcontainers
import java.util.UUID

@Testcontainers
@AutoConfigureMockMvc
@SpringBootTest(classes = [DocumentServiceApplication::class])
class ImprintWorkflowTest {
    @Autowired lateinit var mvc: MockMvc

    @Autowired lateinit var mapper: ObjectMapper

    @Autowired lateinit var jdbc: JdbcTemplate

    @MockBean lateinit var identity: IdentityClient

    @BeforeEach
    fun reset() {
        jdbc.execute("TRUNCATE legal_pages, legal_imprint_details, legal_imprint_detail_revisions CASCADE")
        jdbc.update("INSERT INTO legal_imprint_details (id) VALUES (TRUE)")
        Mockito.reset(identity)
        Mockito.`when`(identity.authenticate(null)).thenThrow(UnauthorizedException("Missing session"))
        Mockito.`when`(identity.authenticate(ADMIN)).thenReturn(Actor(UUID.randomUUID(), "admin@example.test", listOf("admin")))
        Mockito.`when`(identity.authenticate(VIEWER)).thenReturn(Actor(UUID.randomUUID(), "viewer@example.test", listOf("viewer")))
    }

    private fun draft(textRevision: Int = 0, contactRevision: Int = 0, text: String = "Reviewed prose", street: String = "Test Lane 1") =
        mapper.writeValueAsString(
            mapOf(
                "content" to text,
                "expectedRevision" to textRevision,
                "contact" to mapOf(
                    "expectedRevision" to contactRevision,
                    "name" to "Atlas Operator",
                    "streetAddress" to street,
                    "postalCode" to "12345",
                    "city" to "Test City",
                    "country" to "Test Country",
                    "email" to "atlas@example.test",
                ),
            ),
        )

    @Test
    fun combinedWritesRequireAdminAndKeepLanguageTextSeparate() {
        mvc.put("/legal-pages/impressum/draft") {
            header("Authorization", VIEWER)
            contentType = MediaType.APPLICATION_JSON
            content = draft()
        }.andExpect { status { isForbidden() } }
        mvc.put("/legal-pages/impressum/draft") {
            header("Authorization", ADMIN)
            contentType = MediaType.APPLICATION_JSON
            content = draft(text = "German prose")
        }.andExpect { status { isOk() } }
        mvc.get("/legal-pages/impressum").andExpect { status { isNotFound() } }
        mvc.get("/legal-pages/imprint-details").andExpect { status { isNotFound() } }
        mvc.post("/legal-pages/impressum/publish") {
            header("Authorization", VIEWER)
            contentType = MediaType.APPLICATION_JSON
            content = """{"expectedRevision":1,"expectedContactRevision":1}"""
        }.andExpect { status { isForbidden() } }
        mvc.post("/legal-pages/impressum/publish") {
            header("Authorization", ADMIN)
            contentType = MediaType.APPLICATION_JSON
            content = """{"expectedRevision":1,"expectedContactRevision":1}"""
        }.andExpect { status { isOk() } }
        mvc.put("/legal-pages/impressum_en/draft") {
            header("Authorization", ADMIN)
            contentType = MediaType.APPLICATION_JSON
            content = draft(contactRevision = 1, text = "English prose", street = "Test Lane 2")
        }.andExpect { status { isOk() } }
        mvc.get("/legal-pages/imprint-details").andExpect { jsonPath("$.streetAddress") { value("Test Lane 1") } }
        mvc.get("/legal-pages/impressum_en").andExpect { status { isNotFound() } }
        mvc.post("/legal-pages/impressum_en/publish") {
            header("Authorization", ADMIN)
            contentType = MediaType.APPLICATION_JSON
            content = """{"expectedRevision":1,"expectedContactRevision":2}"""
        }.andExpect { status { isOk() } }
        mvc.get("/legal-pages/impressum").andExpect { jsonPath("$.content") { value("German prose") } }
        mvc.get("/legal-pages/impressum_en").andExpect { jsonPath("$.content") { value("English prose") } }
        mvc.get("/legal-pages/imprint-details").andExpect { jsonPath("$.streetAddress") { value("Test Lane 2") } }
    }

    @Test
    fun invalidTextOrEitherStaleRevisionRollsBackContactChanges() {
        mvc.put("/legal-pages/impressum/draft") {
            header("Authorization", ADMIN)
            contentType = MediaType.APPLICATION_JSON
            content = draft(text = "EXAMPLE — REPLACE BEFORE PUBLICATION")
        }.andExpect { status { isOk() } }
        mvc.post("/legal-pages/impressum/publish") {
            header("Authorization", ADMIN)
            contentType = MediaType.APPLICATION_JSON
            content = """{"expectedRevision":1,"expectedContactRevision":1}"""
        }.andExpect { status { isBadRequest() } }
        mvc.get("/legal-pages/imprint-details").andExpect { status { isNotFound() } }
        mvc.put("/legal-pages/impressum/draft") {
            header("Authorization", ADMIN)
            contentType = MediaType.APPLICATION_JSON
            content = draft(1, 1)
        }.andExpect { status { isOk() } }
        mvc.put("/legal-pages/impressum/draft") {
            header("Authorization", ADMIN)
            contentType = MediaType.APPLICATION_JSON
            content = draft(0, 2, street = "Must roll back")
        }.andExpect { status { isConflict() } }
        mvc.get("/legal-pages/imprint-details/editor") { header("Authorization", ADMIN) }.andExpect {
            jsonPath("$.draft.revision") { value(2) }
            jsonPath("$.draft.streetAddress") { value("Test Lane 1") }
        }
        for ((textRevision, contactRevision) in listOf(1 to 2, 2 to 1)) {
            mvc.post("/legal-pages/impressum/publish") {
                header("Authorization", ADMIN)
                contentType = MediaType.APPLICATION_JSON
                content = """{"expectedRevision":$textRevision,"expectedContactRevision":$contactRevision}"""
            }.andExpect { status { isConflict() } }
            mvc.get("/legal-pages/impressum").andExpect { status { isNotFound() } }
            mvc.get("/legal-pages/imprint-details").andExpect { status { isNotFound() } }
        }
        mvc.post("/legal-pages/impressum/publish") {
            header("Authorization", ADMIN)
            contentType = MediaType.APPLICATION_JSON
            content = """{"expectedRevision":2,"expectedContactRevision":2}"""
        }.andExpect { status { isOk() } }
        mvc.get("/legal-pages/imprint-details").andExpect { jsonPath("$.revision") { value(2) } }
    }

    companion object {
        private const val ADMIN = "Bearer admin"
        private const val VIEWER = "Bearer viewer"

        @Container @JvmStatic
        val postgres: PostgreSQLContainer<*> = PostgreSQLContainer("postgres:16-alpine")

        @JvmStatic @DynamicPropertySource
        fun databaseProperties(registry: DynamicPropertyRegistry) {
            registry.add("spring.datasource.url", postgres::getJdbcUrl)
            registry.add("spring.datasource.username", postgres::getUsername)
            registry.add("spring.datasource.password", postgres::getPassword)
        }
    }
}
