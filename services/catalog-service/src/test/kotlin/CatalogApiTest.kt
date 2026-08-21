import com.constitutionatlas.catalog.CatalogServiceApplication
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
import java.util.UUID

@Testcontainers
@AutoConfigureMockMvc
@SpringBootTest(classes = [CatalogServiceApplication::class])
class CatalogApiTest {
    @Autowired
    lateinit var mockMvc: MockMvc

    @Test
    fun listCountriesIncludesGermany() {
        mockMvc.get("/countries")
            .andExpect {
                status { isOk() }
                jsonPath("$[0].isoCode") { value("DE") }
                jsonPath("$[0].name") { value("Germany") }
            }
    }

    @Test
    fun getCountryOmitsDraftVersions() {
        mockMvc.get("/countries/DE")
            .andExpect {
                status { isOk() }
                jsonPath("$.constitutions[0].slug") { value("basic-law") }
                jsonPath("$.constitutions[0].versions.length()") { value(2) }
                jsonPath("$.constitutions[0].versions[0].versionLabel") { value("1949") }
                jsonPath("$.constitutions[0].versions[1].versionLabel") { value("2022") }
            }
    }

    @Test
    fun unknownCountryReturns404() {
        mockMvc.get("/countries/ZZ").andExpect { status { isNotFound() } }
    }

    @Test
    fun unknownConstitutionReturns404() {
        mockMvc.get("/constitutions/${UUID.fromString("00000000-0000-4000-8000-000000000099")}/versions")
            .andExpect { status { isNotFound() } }
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
