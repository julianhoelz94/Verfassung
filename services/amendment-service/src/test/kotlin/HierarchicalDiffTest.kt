import com.constitutionatlas.platform.DiffEntry
import com.constitutionatlas.platform.DiffNode
import com.constitutionatlas.platform.HierarchicalDiff
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import java.util.UUID

class HierarchicalDiffTest {
    private val beforeVersion = UUID.randomUUID()
    private val afterVersion = UUID.randomUUID()

    private fun node(id: UUID = UUID.randomUUID(), revision: UUID? = UUID.randomUUID(), label: String? = null, entries: List<DiffEntry> = emptyList(), predecessor: UUID? = null, lineage: List<UUID> = emptyList()): DiffNode =
        DiffNode(id, revision, UUID.randomUUID(), "section", label, null, entries, predecessor, lineage)

    @Test
    fun mixedTextAndMetadataAreOwnedByTheirNode() {
        val logical = UUID.randomUUID()
        val text = UUID.randomUUID()
        val old = node(logical, label = "A", entries = listOf(DiffEntry.Text(text, UUID.randomUUID(), UUID.randomUUID(), "Old  text")))
        val fresh = old.copy(revisionId = UUID.randomUUID(), label = "B", entries = listOf(DiffEntry.Text(text, UUID.randomUUID(), UUID.randomUUID(), "New text")))
        val run = HierarchicalDiff.compare(beforeVersion, listOf(old), afterVersion, listOf(fresh))
        assertThat(run.items.map { it.facet }).containsExactly("metadata", "text_changed")
        assertThat(run.items.last().beforeRefs.single().excerpt).isEqualTo("Old  text")
        assertThat(run.items.last().afterRefs.single().versionId).isEqualTo(afterVersion)
    }

    @Test
    fun insertionDoesNotMoveLaterSiblingsButReorderDoes() {
        val a = node(label = "Same")
        val b = node(label = "Same")
        val extra = node(label = "Same")
        assertThat(HierarchicalDiff.compare(beforeVersion, listOf(a, b), afterVersion, listOf(a, extra, b)).items.map { it.facet }).containsExactly("added")
        assertThat(HierarchicalDiff.compare(beforeVersion, listOf(a, b), afterVersion, listOf(b, a)).items.map { it.facet }).containsExactly("move")
    }

    @Test
    fun crossParentMoveAndSubtreeRemovalAreSingleFindings() {
        val child = node()
        val left = node(entries = listOf(DiffEntry.Child(child)))
        val right = node()
        val moved = HierarchicalDiff.compare(beforeVersion, listOf(left, right), afterVersion, listOf(left.copy(revisionId = UUID.randomUUID(), entries = emptyList()), right.copy(revisionId = UUID.randomUUID(), entries = listOf(DiffEntry.Child(child)))))
        assertThat(moved.items.map { it.facet }).containsExactly("move")
        val removed = HierarchicalDiff.compare(beforeVersion, listOf(left), afterVersion, emptyList())
        assertThat(removed.items.map { it.facet }).containsExactly("removed")
    }

    @Test
    fun parentTextMoveUsesGlobalIdentity() {
        val text = DiffEntry.Text(UUID.randomUUID(), UUID.randomUUID(), UUID.randomUUID(), "Portable text")
        val left = node(entries = listOf(text))
        val right = node()
        val moved = HierarchicalDiff.compare(beforeVersion, listOf(left, right), afterVersion, listOf(left.copy(revisionId = UUID.randomUUID(), entries = emptyList()), right.copy(revisionId = UUID.randomUUID(), entries = listOf(text))))
        assertThat(moved.items.map { it.facet }).containsExactly("move")
        assertThat(moved.items.single().beforeRefs.single().kind).isEqualTo("text_entry")
    }

    @Test
    fun splitAndMergeStayAmbiguousUntilReviewed() {
        val source = node()
        val first = node(predecessor = source.occurrenceId)
        val second = node(predecessor = source.occurrenceId)
        val split = HierarchicalDiff.compare(beforeVersion, listOf(source), afterVersion, listOf(first, second))
        assertThat(split.items.map { it.facet }).containsExactly("split")
        assertThat(split.items.single().ambiguous).isTrue()
        assertThat(split.items.single().afterRefs).hasSize(2)
        val merged = node(lineage = listOf(first.occurrenceId!!, second.occurrenceId!!))
        val merge = HierarchicalDiff.compare(beforeVersion, listOf(first, second), afterVersion, listOf(merged))
        assertThat(merge.items.map { it.facet }).containsExactly("merge")
    }

    @Test
    fun sharedRevisionSkipsCopyAndSettingsImpactStaysSeparate() {
        val root = node()
        val run = HierarchicalDiff.compare(beforeVersion, listOf(root), afterVersion, listOf(root.copy(occurrenceId = UUID.randomUUID())), UUID.randomUUID(), UUID.randomUUID())
        assertThat(run.items).isEmpty()
        assertThat(run.settingsImpact).isTrue()
    }

    @Test
    fun largeFlatTreeKeepsOnlyOneCandidate() {
        val roots = (1..1500).map { node() }
        val extra = node()
        val run = HierarchicalDiff.compare(beforeVersion, roots, afterVersion, roots + extra)
        assertThat(run.items.map { it.facet }).containsExactly("added")
    }

    @Test
    fun findingsFollowParentBeforeDescendantAndEarlierBranchBeforeLaterBranch() {
        val child = node(label = "child")
        val otherChild = node(label = "other child")
        val first = node(label = "first", entries = listOf(DiffEntry.Child(child), DiffEntry.Child(otherChild)))
        val second = node(label = "second")
        val revised = first.copy(revisionId = UUID.randomUUID(), title = "Revised", entries = emptyList())
        val added = node(label = "added")
        val run = HierarchicalDiff.compare(beforeVersion, listOf(first, second), afterVersion, listOf(revised, second.copy(revisionId = UUID.randomUUID(), entries = listOf(DiffEntry.Child(added)))))
        assertThat(run.items.map { it.facet }).containsExactly("metadata", "removed", "removed", "added")
        assertThat(run.items.filter { it.facet == "removed" }.map { it.beforeRefs.single().logicalId }).containsExactly(child.logicalId, otherChild.logicalId)
    }

    @Test
    fun revisionLineageGroupsPersistedNodeSplitsAndMerges() {
        val source = node()
        val first = node(lineage = listOf(source.revisionId!!))
        val second = node(lineage = listOf(source.revisionId!!))
        assertThat(HierarchicalDiff.compare(beforeVersion, listOf(source), afterVersion, listOf(first, second)).items.map { it.facet }).containsExactly("split")
        val merged = node(lineage = listOf(first.revisionId!!, second.revisionId!!))
        assertThat(HierarchicalDiff.compare(beforeVersion, listOf(first, second), afterVersion, listOf(merged)).items.map { it.facet }).containsExactly("merge")
    }

    @Test
    fun duplicateLabelParentMoveChangesFingerprint() {
        val child = node(label = "child")
        val first = node(label = "Same", entries = listOf(DiffEntry.Child(child)))
        val second = node(label = "Same")
        val third = node(label = "Same")
        fun moved(toSecond: Boolean): com.constitutionatlas.platform.DiffItem {
            val targets = listOf(
                first.copy(revisionId = UUID.randomUUID(), entries = emptyList()),
                second.copy(revisionId = UUID.randomUUID(), entries = if (toSecond) listOf(DiffEntry.Child(child)) else emptyList()),
                third.copy(revisionId = UUID.randomUUID(), entries = if (toSecond) emptyList() else listOf(DiffEntry.Child(child))),
            )
            return HierarchicalDiff.compare(beforeVersion, listOf(first, second, third), afterVersion, targets).items.single { it.facet == "move" }
        }
        val left = moved(true)
        val right = moved(false)
        assertThat(left.key).isEqualTo(right.key)
        assertThat(left.fingerprint).isNotEqualTo(right.fingerprint)
    }
}
