import com.constitutionatlas.document.service.DocumentFileValidation
import org.junit.jupiter.api.Assertions.assertDoesNotThrow
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Test
import java.io.ByteArrayOutputStream
import java.util.zip.ZipEntry
import java.util.zip.ZipOutputStream

class DocumentFileValidationTest {
    @Test
    fun officeAttachmentsRequireTheirDocumentStructureRatherThanArbitraryZipBytes() {
        fun archive(vararg names: String): ByteArray {
            val bytes = ByteArrayOutputStream()
            ZipOutputStream(bytes).use { zip ->
                names.forEach { name ->
                    zip.putNextEntry(ZipEntry(name))
                    zip.write("<xml/>".toByteArray())
                    zip.closeEntry()
                }
            }
            return bytes.toByteArray()
        }
        val type = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        assertDoesNotThrow { DocumentFileValidation.validate("source.docx", type, archive("[Content_Types].xml", "word/document.xml")) }
        assertThrows(IllegalArgumentException::class.java) { DocumentFileValidation.validate("fake.docx", type, archive("unrelated.txt")) }
    }

    @Test
    fun pdfAndTextClaimsAreValidatedWhileLegacyCapturedBytesRemainDownloadable() {
        assertDoesNotThrow { DocumentFileValidation.validate("source.pdf", "application/pdf", "%PDF-1.4\n".toByteArray()) }
        assertThrows(IllegalArgumentException::class.java) { DocumentFileValidation.validate("fake.pdf", "application/pdf", "not a PDF".toByteArray()) }
        assertThrows(IllegalArgumentException::class.java) { DocumentFileValidation.validate("fake.txt", "text/plain", byteArrayOf(0xff.toByte(), 0x00)) }
        assertDoesNotThrow { DocumentFileValidation.validate("captured.html", "application/octet-stream", "<html>legacy</html>".toByteArray()) }
    }
}
