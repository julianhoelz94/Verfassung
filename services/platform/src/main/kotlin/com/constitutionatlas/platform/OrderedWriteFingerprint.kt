package com.constitutionatlas.platform

import java.security.MessageDigest

/** A new optional field must not invalidate receipts for identical pre-upgrade writes. */
object OrderedWriteFingerprint {
    fun current(request: OrderedSnapshotWrite): String = hash(request.toString())

    fun accepted(request: OrderedSnapshotWrite): Set<String> {
        fun hasBreaks(node: OrderedNodeWrite): Boolean = node.content.orEmpty().any { it.lineBreaksBefore != 0 || it.node?.let(::hasBreaks) == true }
        fun hasMarks(node: OrderedNodeWrite): Boolean = node.content.orEmpty().any { it.marks.isNotEmpty() || it.node?.let(::hasMarks) == true }
        val current = current(request)
        if (request.roots.any(::hasBreaks)) return setOf(current)
        fun legacy(includeMarks: Boolean): String {
            fun node(value: OrderedNodeWrite): String {
                val content = value.content?.joinToString(prefix = "[", postfix = "]") { entry ->
                    val marks = if (includeMarks) ", marks=${entry.marks}" else ""
                    "OrderedEntryWrite(type=${entry.type}, node=${entry.node?.let(::node)}, revisionId=${entry.revisionId}, logicalId=${entry.logicalId}, predecessorRevisionId=${entry.predecessorRevisionId}, text=${entry.text}, lineage=${entry.lineage}, format=${entry.format}, table=${entry.table}, footnoteLabel=${entry.footnoteLabel}, references=${entry.references}, annotation=${entry.annotation}$marks)"
                }
                return "OrderedNodeWrite(revisionId=${value.revisionId}, logicalId=${value.logicalId}, predecessorRevisionId=${value.predecessorRevisionId}, kind=${value.kind}, label=${value.label}, title=${value.title}, content=$content, lineage=${value.lineage})"
            }
            val roots = request.roots.joinToString(prefix = "[", postfix = "]", transform = ::node)
            return "OrderedSnapshotWrite(expectedGeneration=${request.expectedGeneration}, sourceVersionId=${request.sourceVersionId}, sourceGeneration=${request.sourceGeneration}, roots=$roots, publishAttemptId=${request.publishAttemptId})"
        }
        return buildSet {
            add(current)
            add(hash(legacy(includeMarks = true)))
            if (request.roots.none(::hasMarks)) add(hash(legacy(includeMarks = false)))
        }
    }

    private fun hash(value: String): String = MessageDigest.getInstance("SHA-256").digest(value.toByteArray()).joinToString("") { "%02x".format(it) }
}
