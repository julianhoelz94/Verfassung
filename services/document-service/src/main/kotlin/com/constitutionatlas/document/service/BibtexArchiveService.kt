package com.constitutionatlas.document.service

import com.constitutionatlas.document.api.DocumentDto
import com.constitutionatlas.document.repo.DocumentFileRepository
import org.springframework.stereotype.Service
import org.springframework.util.StreamUtils
import org.springframework.web.servlet.mvc.method.annotation.StreamingResponseBody
import java.util.UUID
import java.util.zip.ZipEntry
import java.util.zip.ZipOutputStream

@Service
class BibtexArchiveService(private val files: DocumentFileRepository) {
    private data class Attachment(val revisionId: UUID, val fileId: UUID, val path: String)

    /** Snapshot the manifest before writing headers; stream one immutable file at a time. */
    fun archive(documents: List<DocumentDto>): StreamingResponseBody {
        val attachments = documents.associate { document ->
            document.id to document.revision.attachments.map { file ->
                Attachment(document.revision.id, file.id, "files/${document.id}/${file.id}-${safeName(file.fileName)}")
            }
        }
        val bibliography = BibtexCodec.encode(documents, attachments.mapValues { (_, values) -> values.map { it.path } })
        return StreamingResponseBody { output ->
            ZipOutputStream(StreamUtils.nonClosing(output), Charsets.UTF_8).use { zip ->
                zip.putNextEntry(ZipEntry("references.bib"))
                zip.write(bibliography.toByteArray(Charsets.UTF_8))
                zip.closeEntry()
                attachments.values.flatten().forEach { attachment ->
                    val bytes = checkNotNull(files.file(attachment.revisionId, attachment.fileId)) { "Export attachment is unavailable" }.second
                    zip.putNextEntry(ZipEntry(attachment.path))
                    zip.write(bytes)
                    zip.closeEntry()
                }
            }
        }
    }

    private fun safeName(name: String): String = name.substringAfterLast('/').substringAfterLast('\\')
        .replace(Regex("[^\\p{L}\\p{N}._-]+"), "_").take(120).trim('.')
        .ifBlank { "attachment" }
}
