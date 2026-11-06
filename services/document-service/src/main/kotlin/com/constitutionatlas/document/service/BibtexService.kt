package com.constitutionatlas.document.service

import com.constitutionatlas.document.api.BibtexImportDto
import com.constitutionatlas.document.api.BibtexImportRequest
import com.constitutionatlas.document.api.BibtexPreviewDto
import com.constitutionatlas.document.api.BibtexPreviewEntryDto
import com.constitutionatlas.document.api.BibtexPreviewRequest
import com.constitutionatlas.document.api.DocumentDto
import com.constitutionatlas.document.api.SaveDocumentRequest
import com.constitutionatlas.document.repo.BibtexRepository
import com.constitutionatlas.platform.Actor
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import tools.jackson.databind.ObjectMapper
import java.security.MessageDigest
import java.util.UUID

@Service
class BibtexService(
    private val documents: DocumentService,
    private val library: LibraryService,
    private val receipts: BibtexRepository,
    private val mapper: ObjectMapper,
) {
    private val parser = BibtexParser()

    fun preview(request: BibtexPreviewRequest): BibtexPreviewDto {
        request.folderId?.let(library::folder)
        val parsed = parser.parse(request.content)
        val current = library.all()
        val repeated = parsed.entries.groupingBy { it.key.lowercase() }.eachCount().filterValues { it > 1 }.keys
        return BibtexPreviewDto(
            parsed.entries.mapIndexed { index, entry ->
                val record = BibtexCodec.decode(entry)
                val conflict = library.keyDocument(entry.key)
                val candidates = (listOfNotNull(conflict) + current.filter { candidate -> duplicate(record, candidate) }).distinctBy { it.id }.take(10)
                BibtexPreviewEntryDto(
                    index, entry.key, record.title, record.bibliography, record.sourceUrl, record.description,
                    conflict?.id, candidates,
                    record.warnings + if (entry.key.lowercase() in repeated) listOf("This key appears more than once in the import; choose distinct keys or skip duplicate entries.") else emptyList(),
                )
            },
            parsed.warnings,
        )
    }

    @Transactional
    fun importEntries(request: BibtexImportRequest, actor: Actor): BibtexImportDto {
        require(request.operationId.matches(Regex("[A-Za-z0-9_-]{1,128}"))) { "A valid import operation ID is required" }
        val hash = MessageDigest.getInstance("SHA-256").digest(mapper.writeValueAsBytes(request)).joinToString("") { "%02x".format(it) }
        receipts.prior(actor.id, request.operationId, hash)?.let { return it }
        val folder = request.folderId?.let(library::folder)
        val parsed = parser.parse(request.content)
        require(request.decisions.size == parsed.entries.size && request.decisions.map { it.index }.toSet() == parsed.entries.indices.toSet()) {
            "Choose exactly one import decision for every entry"
        }
        val decisions = request.decisions.associateBy { it.index }
        decisions.values.forEach { decision ->
            require(decision.action in setOf("create", "skip", "update", "link")) { "Unknown import action: ${decision.action}" }
            if (decision.action in setOf("update", "link")) require(decision.documentId != null) { "Choose an existing document for ${decision.action}" }
            if (decision.action == "update") require(decision.expectedRevision != null) { "Updating an existing document requires its expected revision" }
        }
        val imported = mutableListOf<DocumentDto>()
        var skipped = 0
        parsed.entries.forEachIndexed { index, entry ->
            val decision = decisions.getValue(index)
            if (decision.action == "skip") {
                skipped++
            } else {
                val record = BibtexCodec.decode(entry)
                val result = when (decision.action) {
                    "create" -> documents.create(
                        SaveDocumentRequest(
                            title = record.title,
                            description = record.description,
                            sourceUrl = record.sourceUrl,
                            citationKey = decision.citationKey ?: entry.key,
                            bibliography = record.bibliography,
                        ),
                        actor,
                    )
                    "update" -> documents.revise(
                        decision.documentId!!,
                        SaveDocumentRequest(
                            title = record.title,
                            description = record.description,
                            sourceUrl = record.sourceUrl,
                            expectedRevision = decision.expectedRevision,
                            citationKey = decision.citationKey,
                            bibliography = record.bibliography,
                        ),
                        actor,
                    )
                    else -> documents.get(decision.documentId!!).also { require(it.status == "active") { "Cannot import into an archived document" } }
                }
                imported.add(if (folder == null) result else library.addTag(result.id, folder.tagId, actor))
            }
        }
        val result = BibtexImportDto(imported, skipped)
        receipts.complete(actor.id, request.operationId, hash, result)
        return result
    }

    fun exportDocuments(folderId: UUID?, documentIds: Set<UUID>?): List<DocumentDto> {
        val folder = folderId?.let(library::folder)
        if (documentIds == null) return library.all(folderId)
        require(documentIds.isNotEmpty() && documentIds.size <= 1000) { "Select between 1 and 1000 documents" }
        val records = documentIds.map(documents::get)
        require(folder == null || records.all { document -> document.tags.any { it.id == folder.tagId } }) {
            "Some selected documents are outside this folder"
        }
        return records
    }

    private fun duplicate(record: BibtexCodec.Record, candidate: DocumentDto): Boolean {
        val bibliography = candidate.revision.bibliography
        val doi = normalizedDoi(record.bibliography.doi)
        val isbn = normalizedIsbn(record.bibliography.isbn)
        return doi != null &&
            doi == normalizedDoi(bibliography.doi) ||
            isbn != null &&
            isbn == normalizedIsbn(bibliography.isbn) ||
            record.title.trim().equals(candidate.revision.title.trim(), ignoreCase = true) &&
            record.bibliography.issued == bibliography.issued
    }

    private fun normalizedDoi(value: String?): String? = value?.trim()?.lowercase()?.removePrefix("https://doi.org/")?.removePrefix("http://doi.org/")?.removePrefix("doi:")?.takeIf(String::isNotBlank)
    private fun normalizedIsbn(value: String?): String? = value?.filter(Char::isLetterOrDigit)?.uppercase()?.takeIf(String::isNotBlank)
}
