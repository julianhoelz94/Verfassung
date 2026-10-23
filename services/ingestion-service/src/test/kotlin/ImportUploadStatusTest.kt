import com.constitutionatlas.ingestion.repo.ImportUploadRepository
import com.constitutionatlas.ingestion.repo.UploadRow
import com.constitutionatlas.ingestion.service.ImportService
import com.constitutionatlas.ingestion.service.ImportUploadService
import com.constitutionatlas.platform.Actor
import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import org.mockito.Mockito
import java.util.UUID

class ImportUploadStatusTest {
    @Test
    fun maximumUploadReportsMissingChunksFromOneDatabaseSnapshot() {
        val repository = Mockito.mock(ImportUploadRepository::class.java)
        val service = ImportUploadService(repository, Mockito.mock(ImportService::class.java), jacksonObjectMapper())
        val owner = Actor(UUID.randomUUID(), "editor@example.local", listOf("editor"))
        val upload = UploadRow(UUID.randomUUID(), UUID.randomUUID(), owner.id, "upload-key", "a".repeat(64), ImportUploadService.MAX_ITEM_BYTES, "receiving", null)
        Mockito.`when`(repository.find(upload.id, false)).thenReturn(upload)
        Mockito.`when`(repository.chunkIndices(upload.id)).thenReturn(setOf(0, 2, 49))

        val status = service.get(upload.id, owner)

        assertThat(status.missingChunks).containsExactlyElementsOf((0 until 50).filterNot { it in setOf(0, 2, 49) })
        Mockito.verify(repository, Mockito.times(1)).chunkIndices(upload.id)
    }
}
