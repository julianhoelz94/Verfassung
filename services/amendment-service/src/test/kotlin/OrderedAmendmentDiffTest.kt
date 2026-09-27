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

    @Test
    fun independentlyImportedLegacyUnitsCompareByLabelAndOrderedText() {
        fun article(body: String, legacy: Boolean) = ContentTreeArticle(
            UUID.randomUUID(), UUID.randomUUID(), "46a", "Rights", 1,
            logicalId = UUID.randomUUID(), revisionId = UUID.randomUUID(), legacyIdentity = legacy,
            content = listOf(OrderedEntry("text", logicalId = UUID.randomUUID(), revisionId = UUID.randomUUID(), occurrenceId = UUID.randomUUID(), text = body)),
        )
        val source = AmendmentDiff.flatten(listOf(article("Old wording.", true)))
        val changed = AmendmentDiff.diff(source, AmendmentDiff.flatten(listOf(article("New wording.", true))))
        assertThat(changed).hasSize(2)
        assertThat(changed.map { it.type }).containsOnly("changed")
        assertThat(AmendmentDiff.diff(source, AmendmentDiff.flatten(listOf(article("Old wording.", true))))).isEmpty()
        val canonical = AmendmentDiff.diff(AmendmentDiff.flatten(listOf(article("Same wording.", false))), AmendmentDiff.flatten(listOf(article("Same wording.", false))))
        assertThat(canonical).hasSize(4)
        assertThat(canonical.count { it.type == "added" }).isEqualTo(2)
        assertThat(canonical.count { it.type == "removed" }).isEqualTo(2)
    }

    @Test
    fun stableIdentityWinsBeforeLegacyRenumberCollision() {
        val source = FlatNode(UUID.randomUUID(), "article", "1", "1", null, "Original", null, UUID.randomUUID(), "1", UUID.randomUUID(), UUID.randomUUID(), true)
        val newcomer = source.copy(id = UUID.randomUUID(), logicalId = UUID.randomUUID())
        val successor = source.copy(id = UUID.randomUUID(), label = "2", number = "2", articleNumber = "2", revisionId = UUID.randomUUID())
        val changes = AmendmentDiff.diff(listOf(source), listOf(newcomer, successor))
        assertThat(changes.map { it.type }).containsExactly("added", "changed")
        assertThat(changes.first().node.id).isEqualTo(newcomer.id)
        assertThat(changes.last().node.id).isEqualTo(successor.id)
    }

    @Test
    fun legacyParentTextDoesNotPairAcrossDifferentParents() {
        fun parentText(path: String) = FlatNode(UUID.randomUUID(), "parent_text", null, null, null, "Same text", null, UUID.randomUUID(), "46a", UUID.randomUUID(), UUID.randomUUID(), true, path)
        val changes = AmendmentDiff.diff(listOf(parentText("46a/paragraph:(1):0/text:0")), listOf(parentText("46a/paragraph:(2):0/text:0")))
        assertThat(changes.map { it.type }).containsExactly("added", "removed")
    }
}
