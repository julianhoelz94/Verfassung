package com.constitutionatlas.editor.service

import com.constitutionatlas.editor.ConflictException
import com.constitutionatlas.editor.api.DraftEntry
import com.constitutionatlas.editor.api.DraftNode
import java.util.UUID

/** Structural operations retain explicit positions, target tokens and postorder parent updates. */
internal object DraftReplayTree {
    /** Requires an existing root anchor and no stored/draft tokens in the inserted subtree. */
    fun insertRoot(step: DraftReplayStep) {
        require(step.foundNode != null && step.roots.any { it.logicalId == step.operation.targetId }) { "Root insertion requires a source root" }
        val child = step.operation.node ?: throw IllegalArgumentException("New root is required")

        /** Inserted root freshness includes every nested entry. */
        fun fresh(node: DraftNode) {
            require(node.revisionId == null && node.draftId == null) { "Inserted roots cannot claim revisions" }
            node.content.forEach { entry ->
                require(entry.revisionId == null && entry.draftId == null) { "Inserted entries cannot claim revisions" }
                entry.node?.let(::fresh)
            }
        }
        fresh(child)
        val position = step.operation.position ?: throw IllegalArgumentException("Root position is required")
        require(position in 0..step.roots.size) { "Invalid root position" }
        step.roots = step.roots.take(position) + markInserted(child, step.operation.id) + step.roots.drop(position)
    }

    /** Removes the source root before checking its destination index, preserving stored identities. */
    fun moveRoot(step: DraftReplayStep) {
        val root = step.roots.find { it.logicalId == step.operation.targetId } ?: throw IllegalArgumentException("Root required")
        val retained = step.roots.filter { it.logicalId != root.logicalId }
        val position = step.operation.position ?: throw IllegalArgumentException("Root position is required")
        require(position in 0..retained.size) { "Invalid root position" }
        step.roots = retained.take(position) + root + retained.drop(position)
    }

    /** Node headings may be cleared; final outline validation runs after the complete operation sequence. */
    fun setMetadata(step: DraftReplayStep) {
        require(step.foundNode != null) { "Metadata belongs to nodes, not parent text" }
        step.updateNodes { if (it.logicalId == step.operation.targetId) it.copy(title = step.operation.title, label = step.operation.label, draftId = step.operation.id) else it }
    }

    /** Parent insertion accepts one explicit text part or a child subtree without stored/draft tokens. */
    fun insertEntry(step: DraftReplayStep) {
        require(step.foundNode != null) { "Insertion target must be a parent" }
        val entry = if (step.operation.type == "insert_text") {
            val part = step.operation.parts.singleOrNull() ?: throw IllegalArgumentException("insert_text requires one explicitly identified text part")
            DraftEntry("text", logicalId = part.logicalId, draftId = step.operation.id, text = part.text, format = part.format, table = part.table, footnoteLabel = part.footnoteLabel, references = part.references, annotation = part.annotation, marks = part.marks, lineBreaksBefore = part.lineBreaksBefore)
        } else {
            val child = step.operation.node ?: throw IllegalArgumentException("insert_child requires a node")

            /** Child insertion rejects stored or draft tokens recursively. */
            fun newNode(node: DraftNode) {
                require(node.revisionId == null && node.draftId == null) { "Inserted nodes cannot claim source revisions" }
                node.content.forEach { entry ->
                    require(entry.revisionId == null && entry.draftId == null) { "Inserted text cannot claim source revisions" }
                    entry.node?.let(::newNode)
                }
            }
            newNode(child)
            DraftEntry("child", node = markInserted(child, step.operation.id))
        }
        step.updateNodes { node -> if (node.logicalId == step.operation.targetId) node.copy(draftId = step.operation.id, content = insert(node.content, entry, step.operation.position)) else node }
    }

    /** Checks replacement kind before deletion and replacement survival afterwards, then remaps references. */
    fun remove(step: DraftReplayStep) {
        step.operation.replacementId?.let { replacement ->
            var successor: DraftNode? = null

            /** Retains the last matching replacement when the pre-validation tree has duplicates. */
            fun findReplacement(node: DraftNode) {
                if (node.logicalId == replacement) successor = node
                node.content.mapNotNull { it.node }.forEach(::findReplacement)
            }
            step.roots.forEach(::findReplacement)
            require(replacement != step.operation.targetId && step.foundNode != null && successor?.kind == step.foundNode!!.kind) { "A removed unit's replacement must be a distinct surviving unit of the same kind" }
        }
        step.roots = step.roots.filter { it.logicalId != step.operation.targetId }
        step.updateNodes { node ->
            val entries = node.content.filter { it.logicalId != step.operation.targetId && it.node?.logicalId != step.operation.targetId }
            if (entries.size == node.content.size) node else node.copy(content = entries, draftId = step.operation.id)
        }
        step.operation.replacementId?.let { replacement ->
            var survives = false

            /** Confirms the replacement was not removed with its ancestor subtree. */
            fun findSurvivor(node: DraftNode) {
                if (node.logicalId == replacement) survives = true
                node.content.mapNotNull { it.node }.forEach(::findSurvivor)
            }
            step.roots.forEach(::findSurvivor)
            require(survives) { "The replacement cannot be inside the removed subtree" }
            step.remapTargets(mapOf(step.operation.targetId to listOf(replacement)))
        }
    }

    /** Validates destination revision before detaching; inserting into the moved subtree is rejected. */
    fun move(step: DraftReplayStep) {
        val moving = step.foundEntry ?: throw IllegalArgumentException("Move requires an entry under a parent")
        val destination = step.operation.destinationParentId ?: throw IllegalArgumentException("Move requires an explicit destination parent")
        require(destination != step.operation.targetId) { "A node cannot contain itself" }
        var destinationNode: DraftNode? = null

        /** Destination lookup retains the original last-match traversal semantics. */
        fun findDestination(node: DraftNode) {
            if (node.logicalId == destination) destinationNode = node
            node.content.mapNotNull { it.node }.forEach(::findDestination)
        }
        step.roots.forEach(::findDestination)
        val destinationToken = destinationNode?.let { it.draftId ?: it.revisionId }
        if (destinationToken != step.operation.destinationRevisionId) throw ConflictException("Stale destination parent", "stale_draft_unit")
        step.updateNodes { node ->
            val retained = node.content.filter { it.logicalId != step.operation.targetId && it.node?.logicalId != step.operation.targetId }
            if (retained.size == node.content.size) node else node.copy(content = retained, draftId = step.operation.id)
        }
        var inserted = false
        step.updateNodes { node ->
            if (node.logicalId == destination) {
                inserted = true
                node.copy(draftId = step.operation.id, content = insert(node.content, moving, step.operation.position))
            } else {
                node
            }
        }
        require(inserted) { "Move destination cannot be inside the moved subtree" }
    }

    /** New nodes and text receive this operation token, preserving entry-wrapper fields. */
    fun markInserted(node: DraftNode, id: UUID): DraftNode = node.copy(draftId = id, content = node.content.map { entry -> entry.node?.let { entry.copy(node = markInserted(it, id)) } ?: entry.copy(draftId = id) })

    /** Explicit insertion indices include the end of the retained parent sequence. */
    fun insert(entries: List<DraftEntry>, entry: DraftEntry, position: Int?): List<DraftEntry> {
        val index = position ?: throw IllegalArgumentException("Explicit insertion position is required")
        require(index in 0..entries.size) { "Insertion position is outside the parent sequence" }
        return entries.take(index) + entry + entries.drop(index)
    }
}
