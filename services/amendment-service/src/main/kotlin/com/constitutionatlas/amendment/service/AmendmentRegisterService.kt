package com.constitutionatlas.amendment.service

import com.constitutionatlas.amendment.api.AmendmentDto
import org.springframework.stereotype.Service
import java.time.LocalDate
import java.util.UUID

data class AmendmentRegisterPage(val constitutionId: UUID, val items: List<AmendmentDto>, val total: Int, val offset: Int, val limit: Int)

@Service
class AmendmentRegisterService(private val amendments: AmendmentService) {
    fun search(constitution: UUID, query: String, unit: String?, from: LocalDate?, until: LocalDate?, dateKind: String, offset: Int, limit: Int): AmendmentRegisterPage {
        require(query.length <= 200 && (unit?.length ?: 0) <= 512 && offset >= 0 && limit in 1..50) { "Invalid amendment register query" }
        require(dateKind in setOf("instrument", "effective") && (from == null || until == null || from <= until)) { "Invalid date filter" }
        val text = query.trim().lowercase()
        val results = amendments.listForConstitution(constitution).filter { record ->
            val date = if (dateKind == "instrument") record.enactedOn else record.effectiveOn
            val dateMatches = (from == null || date != null && date >= from) && (until == null || date != null && date <= until)
            val unitMatches = unit.isNullOrBlank() ||
                record.changes.any { change ->
                    change.articleNumber.equals(unit, ignoreCase = true) || change.beforeRef?.label.equals(unit, ignoreCase = true) || change.afterRef?.label.equals(unit, ignoreCase = true) || change.nodeId?.toString() == unit
                }
            val words = buildString {
                append(record.title).append(' ').append(record.comment)
                record.documents.forEach { append(' ').append(it.label).append(' ').append(it.url) }
                record.changes.forEach { append(' ').append(it.amendingLawTitle).append(' ').append(it.amendingLawCitation).append(' ').append(it.articleNumber) }
            }.lowercase()
            dateMatches && unitMatches && (text.isEmpty() || text in words)
        }.sortedWith(compareByDescending<AmendmentDto> { it.enactedOn }.thenBy { it.title }.thenBy { it.id })
        return AmendmentRegisterPage(constitution, results.drop(offset).take(limit), results.size, offset, limit)
    }
}
