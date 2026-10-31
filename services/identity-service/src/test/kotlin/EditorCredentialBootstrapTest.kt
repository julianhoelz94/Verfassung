import com.constitutionatlas.identity.crypto.Tokens
import com.constitutionatlas.identity.repo.IdentityRepository
import com.constitutionatlas.identity.repo.StoredServiceToken
import com.constitutionatlas.identity.service.EditorCredentialBootstrap
import com.constitutionatlas.identity.setup.SetupRepository
import com.constitutionatlas.identity.setup.SetupState
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Test
import org.mockito.Mockito
import org.springframework.boot.DefaultApplicationArguments
import java.time.OffsetDateTime
import java.util.UUID

class EditorCredentialBootstrapTest {
    private val users = Mockito.mock(IdentityRepository::class.java)
    private val setup = Mockito.mock(SetupRepository::class.java)
    private val admin = UUID.randomUUID()
    private val token = "e".repeat(64)
    private val expectedScopes = listOf("catalog:write", "catalog:publish", "content:write", "amendment:write", "amendment:publish", "audit:append", "search:reindex")

    init {
        Mockito.`when`(setup.get(true)).thenReturn(SetupState(admin, OffsetDateTime.now(), false, false, true, listOf("de"), "de"))
        Mockito.`when`(users.rolesForUser(admin)).thenReturn(listOf("admin"))
    }

    private fun provision(value: String = token) = EditorCredentialBootstrap(users, setup, value).run(DefaultApplicationArguments())

    @Test
    fun provisionsOnlyHashedBackendAccessWithoutCreatingUsersOrChangingTheirCredentials() {
        val before = OffsetDateTime.now().plusDays(90).minusMinutes(1)
        provision()
        val calls = Mockito.mockingDetails(users).invocations
        val insert = calls.single { it.method.name == "insertServiceToken" }
        assertThat(insert.arguments[0]).isEqualTo("managed-editor")
        assertThat(insert.arguments[1]).isEqualTo(Tokens.sha256Hex(token))
        assertThat(insert.arguments[2]).isEqualTo(expectedScopes)
        assertThat(insert.arguments[3]).isEqualTo(admin)
        assertThat(insert.arguments[4] as OffsetDateTime).isBetween(before, before.plusMinutes(2))
        assertThat(calls.map { it.method.name }).doesNotContain("insertUser", "assignRole", "updatePasswordHash")
    }

    @Test
    fun restartRenewsExpiryAndRedeploymentRotatesInPlaceAndRemovesExcessScopes() {
        val id = UUID.randomUUID()
        val previous = StoredServiceToken(id, "managed-editor", Tokens.sha256Hex(token), listOf("audit:read", "ingestion:publish"), admin, OffsetDateTime.now(), OffsetDateTime.now(), null, null)
        Mockito.`when`(users.findActiveServiceTokenByName("managed-editor")).thenReturn(previous)
        provision()
        Mockito.verify(users).replaceActiveServiceTokenScopes("managed-editor", expectedScopes)
        val renew = Mockito.mockingDetails(users).invocations.single { it.method.name == "renewActiveServiceTokenExpiry" }
        assertThat(renew.arguments[0]).isEqualTo("managed-editor")
        assertThat(Mockito.mockingDetails(users).invocations.map { it.method.name }).doesNotContain("rotateServiceToken", "insertServiceToken")
        Mockito.clearInvocations(users)
        val replacement = "n".repeat(64)
        provision(replacement)
        val rotation = Mockito.mockingDetails(users).invocations.single { it.method.name == "rotateServiceToken" }
        assertThat(rotation.arguments[0]).isEqualTo(id)
        assertThat(rotation.arguments[1]).isEqualTo(Tokens.sha256Hex(replacement))
        assertThat(Mockito.mockingDetails(users).invocations.map { it.method.name }).doesNotContain("insertServiceToken", "renewActiveServiceTokenExpiry")
    }

    @Test
    fun refusesToTakeOverAnotherAccountsTokenOrUseANonAdminOwner() {
        Mockito.`when`(users.findActiveServiceTokenByName("managed-editor")).thenReturn(
            StoredServiceToken(UUID.randomUUID(), "managed-editor", Tokens.sha256Hex(token), expectedScopes, UUID.randomUUID(), OffsetDateTime.now(), OffsetDateTime.now(), null, null),
        )
        assertThrows(IllegalStateException::class.java) { provision() }
        Mockito.`when`(users.rolesForUser(admin)).thenReturn(listOf("editor"))
        assertThrows(IllegalStateException::class.java) { provision() }
        assertThat(Mockito.mockingDetails(users).invocations.map { it.method.name }).doesNotContain("insertServiceToken", "rotateServiceToken", "replaceActiveServiceTokenScopes")
    }

    @Test
    fun invalidSecretsFailBeforeAnyDatabaseAccessAndAreNotIncludedInErrors() {
        for (value in listOf("", "short-private-value", " ".repeat(64), "x!".repeat(32))) {
            val error = assertThrows(IllegalStateException::class.java) { provision(value) }
            if (value.isNotEmpty()) assertThat(error.message).doesNotContain(value)
        }
        assertThat(Mockito.mockingDetails(users).invocations).isEmpty()
        assertThat(Mockito.mockingDetails(setup).invocations).isEmpty()
    }
}
