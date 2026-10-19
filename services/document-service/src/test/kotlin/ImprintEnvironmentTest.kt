import com.constitutionatlas.document.api.ImprintDetailsDto
import com.constitutionatlas.document.api.SaveImprintDetailsRequest
import com.constitutionatlas.document.service.ImprintEnvironment
import org.junit.jupiter.api.Test
import org.springframework.mock.env.MockEnvironment

class ImprintEnvironmentTest {
    @Test
    fun environmentPrefillsDraftsAndCannotRewritePublishedDetails() {
        val environment = ImprintEnvironment(MockEnvironment().withProperty("IMPRINT_NAME", "Real operator").withProperty("IMPRINT_EMAIL", "operator@test.example"))
        val saved = ImprintDetailsDto(2, "Saved name", "Saved street", "10000", "Berlin", "Germany", "old@test.example")
        val effective = environment.draft(saved)!!
        check(effective.name == "Real operator" && effective.streetAddress == "Saved street" && effective.revision == 2)
        check(saved.name == "Saved name" && saved.email == "old@test.example")
        check(environment.managedFields().toSet() == setOf("name", "email"))
        val request = environment.request(SaveImprintDetailsRequest(2, "Untrusted edit", "New street", "20000", "Bonn", "Germany", "edit@test.example"))
        check(request.name == "Real operator" && request.email == "operator@test.example" && request.streetAddress == "New street")
        check(environment.draft(null)?.revision == 0)
        check(ImprintEnvironment(MockEnvironment()).draft(null) == null)
    }
}
