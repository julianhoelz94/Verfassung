import com.constitutionatlas.amendment.api.AmendmentChangeDto
import com.constitutionatlas.amendment.api.AmendmentDto
import com.constitutionatlas.amendment.api.AmendmentUnitRefDto
import com.constitutionatlas.amendment.service.AmendmentRegisterService
import com.constitutionatlas.amendment.service.AmendmentService
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import org.mockito.Mockito
import java.time.LocalDate
import java.util.UUID

class AmendmentRegisterTest {
    @Test
    fun filtersCitationsLiteralUnitsAndDistinctInstrumentDatesWithoutChangingPins() {
        val amendments = Mockito.mock(AmendmentService::class.java)
        val constitution = UUID.randomUUID()
        val source = UUID.randomUUID()
        val first = AmendmentDto(
            id = UUID.randomUUID(), constitutionId = constitution, status = "published", title = "Rights act", comment = "Reviewed instrument",
            enactedOn = LocalDate.parse("1850-01-02"), effectiveOn = null, sourceVersionId = source, targetVersionId = UUID.randomUUID(),
            changes = listOf(AmendmentChangeDto(UUID.randomUUID(), articleId = null, articleNumber = "46a", changeType = "modified", note = null, nodeId = null, changedOn = null, effectiveOn = null, amendingLawCitationId = null, amendingLawCitation = "Gazette 1850 p. 17", beforeRef = AmendmentUnitRefDto(versionId = source, text = "Original wording"))),
        )
        val second = first.copy(id = UUID.randomUUID(), title = "Later act", enactedOn = null, effectiveOn = LocalDate.parse("1851-03-04"), changes = emptyList())
        Mockito.`when`(amendments.listForConstitution(constitution)).thenReturn(listOf(first, second))
        val register = AmendmentRegisterService(amendments)
        assertThat(register.search(constitution, "Gazette 1850", "46a", null, null, "instrument", 0, 20).items).containsExactly(first)
        assertThat(register.search(constitution, "", null, LocalDate.parse("1849-01-01"), LocalDate.parse("1852-01-01"), "instrument", 0, 20).items).containsExactly(first)
        assertThat(register.search(constitution, "", null, LocalDate.parse("1849-01-01"), LocalDate.parse("1852-01-01"), "effective", 0, 20).items).containsExactly(second)
        val next = register.search(constitution, "", null, null, null, "instrument", 1, 1)
        assertThat(next.total).isEqualTo(2)
        assertThat(next.items).containsExactly(second)
        assertThat(first.changes.single().beforeRef?.versionId).isEqualTo(source)
        assertThat(first.changes.single().beforeRef?.text).isEqualTo("Original wording")
    }
}
