import com.constitutionatlas.content.ContentServiceApplication
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
@SpringBootTest(classes = [ContentServiceApplication::class])
class ContentApiTest {
    @Autowired
    lateinit var mockMvc: MockMvc

    @Test
    fun listArticlesFor2022VersionIsOrdered() {
        mockMvc.get("/versions/01900000-0000-4000-8000-000000000004/articles")
            .andExpect {
                status { isOk() }
                jsonPath("$.length()") { value(10) }
                jsonPath("$[0].articleNumber") { value("1") }
                jsonPath("$[5].articleNumber") { value("16a") }
            }
    }

    @Test
    fun getArticleReturnsBody() {
        mockMvc.get("/articles/01900000-0000-4000-8000-000000000201")
            .andExpect {
                status { isOk() }
                jsonPath("$.title") { value("Human dignity") }
                jsonPath("$.body") { exists() }
            }
    }

    @Test
    fun unknownArticleReturns404() {
        mockMvc.get("/articles/${UUID.fromString("00000000-0000-4000-8000-000000000099")}")
            .andExpect { status { isNotFound() } }
    }

    @Test
    fun unknownVersionReturnsEmptyList() {
        mockMvc.get("/versions/${UUID.fromString("00000000-0000-4000-8000-000000000099")}/articles")
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
