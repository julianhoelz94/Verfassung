import com.constitutionatlas.platform.DiffEntry
import com.constitutionatlas.platform.DiffNode
import com.constitutionatlas.platform.HierarchicalDiff
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNotEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import java.util.UUID

class HierarchicalDiffContractTest {
    private val beforeVersion = id(1000)
    private val afterVersion = id(2000)

    @Test
    fun `editor comparison can inspect content despite a shared stored revision`() {
        val text = text(10, "Original")
        val before = node(1, listOf(text))
        val after = before.copy(title = "Revised", entries = listOf(text.copy(text = "Edited")))
        assertTrue(compare(listOf(before), listOf(after)).items.isEmpty())
        val inspected = HierarchicalDiff.compare(beforeVersion, listOf(before), null, listOf(after), skipSharedRevision = false)
        assertEquals(listOf("metadata", "text_changed"), inspected.items.map { it.facet })
        assertTrue(inspected.items.all { it.afterRefs.single().versionId == null })
    }

    @Test
    fun `shared revisions still report a node move before skipping its content`() {
        val child = node(3)
        val left = node(1, listOf(DiffEntry.Child(child)))
        val right = node(2)
        val after = listOf(left.copy(entries = emptyList()), right.copy(entries = listOf(DiffEntry.Child(child))))
        val item = compare(listOf(left, right), after).items.single()
        assertEquals("move", item.facet)
        assertEquals(child.logicalId, item.afterRefs.single().logicalId)
        assertEquals(listOf("constitution:", "section:2", "section:3"), item.afterRefs.single().path)
    }

    @Test
    fun `cross-parent text moves precede exact wording changes without add-remove noise`() {
        val entry = text(10, "Exact  wording")
        val left = node(1, listOf(entry))
        val right = node(2)
        val after = listOf(left.copy(revisionId = id(901), entries = emptyList()), right.copy(revisionId = id(902), entries = listOf(entry.copy(text = "Exact wording"))))
        val items = compare(listOf(left, right), after).items
        assertEquals(listOf("move", "text_changed"), items.map { it.facet })
        assertEquals("Exact  wording", items.last().beforeRefs.single().excerpt)
        assertEquals("Exact wording", items.last().afterRefs.single().excerpt)
        assertEquals("text_entry", items.first().afterRefs.single().kind)
    }

    @Test
    fun `text splits retain revision lineage order and ambiguous group identity`() {
        val original = text(10, "First Second")
        val before = node(1, listOf(original))
        val after = before.copy(revisionId = id(901), entries = listOf(text(11, "First", listOf(original.revisionId!!)), text(12, "Second", listOf(original.revisionId))))
        val item = compare(listOf(before), listOf(after)).items.single()
        assertEquals("split", item.facet)
        assertTrue(item.ambiguous)
        assertEquals(listOf(id(11), id(12)), item.afterRefs.map { it.logicalId })
        assertEquals(listOf(id(10)), item.beforeRefs.map { it.logicalId })
        assertTrue(item.groupKey!!.matches(Regex("[0-9a-f]{64}")))
    }

    @Test
    fun `text merges suppress constituent additions and removals`() {
        val first = text(10, "First")
        val second = text(11, "Second")
        val before = node(1, listOf(first, second))
        val after = before.copy(revisionId = id(901), entries = listOf(text(12, "First Second", listOf(first.revisionId!!, second.revisionId!!))))
        val item = compare(listOf(before), listOf(after)).items.single()
        assertEquals("merge", item.facet)
        assertTrue(item.ambiguous)
        assertEquals(listOf(id(10), id(11)), item.beforeRefs.map { it.logicalId })
        assertEquals(listOf(id(12)), item.afterRefs.map { it.logicalId })
    }

    @Test
    fun `occurrence predecessor takes precedence over a matching logical identity`() {
        val first = node(1)
        val second = node(2)
        val target = first.copy(revisionId = id(901), predecessorId = second.occurrenceId)
        val items = compare(listOf(first, second), listOf(target)).items
        assertEquals(listOf("metadata", "removed"), items.map { it.facet })
        assertEquals(second.logicalId, items.first().beforeRefs.single().logicalId)
        assertEquals(first.logicalId, items.first().afterRefs.single().logicalId)
        assertEquals(first.logicalId, items.last().beforeRefs.single().logicalId)
    }

    @Test
    fun `node occurrence splits take precedence over overlapping revision lineage splits`() {
        val original = node(1)
        val targets = listOf(node(2), node(3)).map { it.copy(predecessorId = original.occurrenceId, lineage = listOf(original.revisionId!!)) }
        val item = compare(listOf(original), targets).items.single()
        assertEquals("split", item.facet)
        assertEquals(listOf(id(2), id(3)), item.afterRefs.map { it.logicalId })
        assertTrue(item.ambiguous)
    }

    @Test
    fun `node merges can reference a source already used by an occurrence split`() {
        val first = node(1)
        val second = node(2)
        val targets = listOf(node(3).copy(predecessorId = first.occurrenceId), node(4).copy(predecessorId = first.occurrenceId), node(5).copy(lineage = listOf(first.occurrenceId!!, second.occurrenceId!!)))
        val items = compare(listOf(first, second), targets).items
        assertEquals(listOf("split", "merge"), items.map { it.facet })
        assertEquals(listOf(first.logicalId, second.logicalId), items.last().beforeRefs.map { it.logicalId })
    }

    @Test
    fun `duplicate logical targets remain ambiguous and deduplicate finding keys`() {
        val before = node(1)
        val target = node(2)
        val items = compare(listOf(before), listOf(target, target.copy(occurrenceId = id(999)))).items
        assertEquals(listOf("removed", "added"), items.map { it.facet })
        assertTrue(items.last().ambiguous)
        assertEquals(target.logicalId, items.last().afterRefs.single().logicalId)
    }

    @Test
    fun `subtree replacement emits only the missing and new ancestor`() {
        val before = node(1, listOf(DiffEntry.Child(node(2))))
        val after = node(3, listOf(DiffEntry.Child(node(4))))
        val items = compare(listOf(before), listOf(after)).items
        assertEquals(listOf("removed", "added"), items.map { it.facet })
        assertEquals(listOf(id(1)), items.first().beforeRefs.map { it.logicalId })
        assertEquals(listOf(id(3)), items.last().afterRefs.map { it.logicalId })
    }

    @Test
    fun `mixed sibling insertion is stable and reorder uses deterministic subsequence ties`() {
        val a = text(10, "A")
        val b = node(2)
        val before = node(1, listOf(a, DiffEntry.Child(b)))
        val inserted = before.copy(revisionId = id(901), entries = listOf(a, text(11, "New"), DiffEntry.Child(b)))
        assertEquals(listOf("text_added"), compare(listOf(before), listOf(inserted)).items.map { it.facet })
        val reordered = before.copy(revisionId = id(902), entries = listOf(DiffEntry.Child(b), a))
        val item = compare(listOf(before), listOf(reordered)).items.single()
        assertEquals("move", item.facet)
        assertEquals(b.logicalId, item.afterRefs.single().logicalId)
    }

    @Test
    fun `semantic rich-content edits are visible when plain wording is unchanged`() {
        val original = text(10, "Header Value").copy(semantic = "table:first-header")
        val before = node(1, listOf(original))
        val after = before.copy(revisionId = id(901), entries = listOf(original.copy(semantic = "table:second-header")))
        assertEquals(listOf("text_changed"), compare(listOf(before), listOf(after)).items.map { it.facet })
    }

    @Test
    fun `finding keys survive revision changes while fingerprints pin exact wording`() {
        val original = text(10, "Original")
        val before = node(1, listOf(original))
        val after = before.copy(revisionId = id(901), entries = listOf(original.copy(revisionId = id(910), text = "Revised")))
        val first = compare(listOf(before), listOf(after)).items.single()
        val second = compare(listOf(before), listOf(after.copy(entries = listOf(original.copy(revisionId = id(911), text = "Other"))))).items.single()
        assertEquals("c7b601b4bbdfa8255b401fb71a6c3d4105e14648aa2bc766e8a9efc827a46195", first.key)
        assertEquals("3a1f14eb5d729bb78caa947b51e0222e99edff2b794be2fffe34061909cf0250", first.fingerprint)
        assertEquals(first.key, second.key)
        assertNotEquals(first.fingerprint, second.fingerprint)
        assertEquals(2, first.level)
    }

    @Test
    fun `settings-only comparisons retain the algorithm identity and empty result`() {
        assertEquals("hierarchical-1", HierarchicalDiff.ALGORITHM_VERSION)
        val run = HierarchicalDiff.compare(null, emptyList(), null, emptyList(), id(1), id(2))
        assertTrue(run.items.isEmpty())
        assertTrue(run.settingsImpact)
        assertFalse(compare(emptyList(), emptyList()).settingsImpact)
    }

    /** Uses fixed identities to make path, grouping and ordering assertions reproducible. */
    private fun id(value: Long): UUID = UUID(0, value)

    /** Each fixture node has distinct logical, revision and occurrence identities. */
    private fun node(value: Long, entries: List<DiffEntry> = emptyList()): DiffNode = DiffNode(id(value), id(100 + value), id(200 + value), "section", value.toString(), null, entries)

    /** Revision lineage is supplied only for split/merge characterization cases. */
    private fun text(value: Long, body: String, lineage: List<UUID> = emptyList()): DiffEntry.Text = DiffEntry.Text(id(value), id(100 + value), id(200 + value), body, lineage)

    /** Compares independently versioned trees with the production shared-revision shortcut enabled. */
    private fun compare(before: List<DiffNode>, after: List<DiffNode>) = HierarchicalDiff.compare(beforeVersion, before, afterVersion, after)
}
