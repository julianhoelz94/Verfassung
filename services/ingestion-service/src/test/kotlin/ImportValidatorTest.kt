import com.constitutionatlas.ingestion.api.ImportOutline
import com.constitutionatlas.ingestion.api.ImportOutlineKind
import com.constitutionatlas.ingestion.api.ImportRequest
import com.constitutionatlas.ingestion.service.ImportValidator
import com.constitutionatlas.platform.OrderedNodeWrite
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class ImportValidatorTest {
    @Test
    fun `pinned outline permits its configured root kind`() {
        val request = ImportRequest(
            isoCode = "FR", countryName = "France", constitutionSlug = "1958",
            constitutionTitle = "Constitution", versionLabel = "1",
            roots = listOf(OrderedNodeWrite(kind = "section", label = "I")),
        )
        val outline = ImportOutline(listOf(ImportOutlineKind("section", "Section")))
        assertTrue(ImportValidator.validate(request, outline).isEmpty())
    }
}
