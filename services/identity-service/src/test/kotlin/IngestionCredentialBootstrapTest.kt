import com.constitutionatlas.identity.crypto.Tokens
import com.constitutionatlas.identity.repo.IdentityRepository
import com.constitutionatlas.identity.repo.StoredServiceToken
import com.constitutionatlas.identity.service.IngestionCredentialBootstrap
import com.constitutionatlas.identity.setup.SetupRepository
import com.constitutionatlas.identity.setup.SetupState
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Test
import org.mockito.Mockito
import org.springframework.boot.DefaultApplicationArguments
import java.time.OffsetDateTime
import java.util.UUID

class IngestionCredentialBootstrapTest {
    private val users = Mockito.mock(IdentityRepository::class.java)
    private val setup = Mockito.mock(SetupRepository::class.java)
    private val admin = UUID.randomUUID()
    private val publish = "p".repeat(64)
    private val audit = "a".repeat(64)
    private val search = "s".repeat(64)

    init {
        Mockito.`when`(setup.get(true)).thenReturn(SetupState(admin, OffsetDateTime.now(), false, false, true, listOf("de"), "de"))
        Mockito.`when`(users.rolesForUser(admin)).thenReturn(listOf("admin"))
    }

    @Test
    fun productionBootstrapRegistersOnlyNarrowHashedCredentialsWithoutDemoSeeding() {
        IngestionCredentialBootstrap(users, setup, publish, audit, search).run(DefaultApplicationArguments())
        val calls = Mockito.mockingDetails(users).invocations
        val inserts = calls.filter { it.method.name == "insertServiceToken" }
        assertThat(inserts).hasSize(3)
        assertThat(inserts.map { it.arguments[1] }).containsExactly(Tokens.sha256Hex(publish), Tokens.sha256Hex(audit), Tokens.sha256Hex(search))
        assertThat(inserts.map { it.arguments[2] }).containsExactly(listOf("ingestion:publish"), listOf("audit:append"), listOf("search:reindex"))
        assertThat(inserts.map { it.arguments[3] }).containsOnly(admin)
        assertThat(calls.map { it.method.name }).doesNotContain("insertUser", "assignRole", "updatePasswordHash")
    }

    @Test
    fun redeploymentRotatesTheManagedCredentialAndRemovesExcessScopes() {
        val id = UUID.randomUUID()
        Mockito.`when`(users.findActiveServiceTokenByName("managed-ingestion-publisher")).thenReturn(
            StoredServiceToken(id, "managed-ingestion-publisher", Tokens.sha256Hex("previous"), listOf("catalog:write", "ingestion:publish"), admin, OffsetDateTime.now(), OffsetDateTime.now(), null, null),
        )
        IngestionCredentialBootstrap(users, setup, publish, audit, search).run(DefaultApplicationArguments())
        val calls = Mockito.mockingDetails(users).invocations
        val rotation = calls.single { it.method.name == "rotateServiceToken" }
        assertThat(rotation.arguments[0]).isEqualTo(id)
        assertThat(rotation.arguments[1]).isEqualTo(Tokens.sha256Hex(publish))
        val scopes = calls.single { it.method.name == "replaceActiveServiceTokenScopes" }
        assertThat(scopes.arguments[1]).isEqualTo(listOf("ingestion:publish"))
    }

    @Test
    fun invalidOrReusedSecretsCannotPartiallyProvisionCredentials() {
        for (value in listOf("", "short", publish)) {
            assertThrows(IllegalStateException::class.java) {
                IngestionCredentialBootstrap(users, setup, publish, value, search).run(DefaultApplicationArguments())
            }
        }
        assertThat(Mockito.mockingDetails(users).invocations).isEmpty()
    }
}
