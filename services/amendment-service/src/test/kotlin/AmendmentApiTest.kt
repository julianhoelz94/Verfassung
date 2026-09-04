import com.constitutionatlas.amendment.AmendmentServiceApplication
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.test.context.DynamicPropertyRegistry
import org.springframework.test.context.DynamicPropertySource
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.get
import org.testcontainers.containers.PostgreSQLContainer
import org.testcontainers.junit.jupiter.Container
import org.testcontainers.junit.jupiter.Testcontainers

@Testcontainers
@AutoConfigureMockMvc
@SpringBootTest(classes = [AmendmentServiceApplication::class])
class AmendmentApiTest {
    @Autowired
    lateinit var mockMvc: MockMvc

    @Test
    fun listAmendmentsFor2022Version() {
        mockMvc.get("/versions/01900000-0000-4000-8000-000000000004/amendments")
            .andExpect {
                status { isOk() }
                jsonPath("$.length()") { value(1) }
                jsonPath("$[0].targetVersionId") { value("01900000-0000-4000-8000-000000000004") }
                jsonPath("$[0].changes.length()") { value(5) }
                jsonPath("$[0].changes[0].changeType") { value("added") }
                jsonPath("$[0].changes[0].nodeId") { value("01900000-0000-4000-8000-000000000225") }
                jsonPath("$[0].changes[0].changedOn") { value("2022-12-19") }
                jsonPath("$[0].changes[1].changeType") { value("changed") }
                jsonPath("$[0].changes[0].amendingLawCitationId") { value("01900000-0000-4000-8000-000000000380") }
            }
    }

    @Test
    fun listAmendmentsCanFilterBySourceVersion() {
        mockMvc.get("/versions/01900000-0000-4000-8000-000000000004/amendments") {
            param("sourceVersionId", "01900000-0000-4000-8000-000000000003")
        }.andExpect {
            status { isOk() }
            jsonPath("$.length()") { value(1) }
            jsonPath("$[0].sourceVersionId") { value("01900000-0000-4000-8000-000000000003") }
        }

        mockMvc.get("/versions/01900000-0000-4000-8000-000000000004/amendments") {
            param("sourceVersionId", "00000000-0000-4000-8000-000000000099")
        }.andExpect {
            status { isOk() }
            jsonPath("$.length()") { value(0) }
        }
    }

    @Test
    fun unknownVersionReturnsEmptyList() {
        mockMvc.get("/versions/00000000-0000-4000-8000-000000000099/amendments")
            .andExpect {
                status { isOk() }
                jsonPath("$.length()") { value(0) }
            }
    }

    companion object {
        @Container
        @JvmStatic
        val postgres: PostgreSQLContainer<*> = PostgreSQLContainer("postgres:16-alpine")

        @JvmStatic
        @DynamicPropertySource
        fun databaseProperties(registry: DynamicPropertyRegistry) {
            registry.add("spring.datasource.url", postgres::getJdbcUrl)
            registry.add("spring.datasource.username", postgres::getUsername)
            registry.add("spring.datasource.password", postgres::getPassword)
        }
    }
}
