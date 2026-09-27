package com.constitutionatlas.amendment.service

import com.constitutionatlas.amendment.client.ContentTreeArticle
import com.constitutionatlas.platform.OrderedEntry
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import java.util.UUID

class OrderedAmendmentDiffTest {
    @Test
    fun sharedRevisionInDistinctVersionOccurrencesIsNotAChange() {
        val logical = UUID.randomUUID()
        val revision = UUID.randomUUID()
        val textLogical = UUID.randomUUID()
        val textRevision = UUID.randomUUID()
        fun article() = ContentTreeArticle(UUID.randomUUID(), UUID.randomUUID(), "46a", "Rights", 1, body = "Wrong legacy projection", logicalId = logical, revisionId = revision, content = listOf(OrderedEntry("text", logicalId = textLogical, revisionId = textRevision, occurrenceId = UUID.randomUUID(), text = "Exact  quote.")))
        val from = AmendmentDiff.flatten(listOf(article()))
        val to = AmendmentDiff.flatten(listOf(article()))
        assertThat(from.map { it.body }).containsExactly("Exact  quote.", "Exact  quote.")
        assertThat(AmendmentDiff.diff(from, to)).isEmpty()
        val changed = to.map { if (it.logicalId == textLogical) it.copy(revisionId = UUID.randomUUID(), body = "Corrected quote.") else it }
        assertThat(AmendmentDiff.diff(from, changed).single().node.logicalId).isEqualTo(textLogical)
    }
}
