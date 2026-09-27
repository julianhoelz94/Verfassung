package com.constitutionatlas.editor.service

import com.constitutionatlas.editor.ConflictException
import com.constitutionatlas.editor.api.DraftEntry
import com.constitutionatlas.editor.api.DraftNode
import com.constitutionatlas.editor.api.DraftOperation
import com.constitutionatlas.editor.client.DraftSettings
import java.util.UUID

object StructuredDraftEngine {
    fun replay(source: List<DraftNode>, operations: List<DraftOperation>, settings: DraftSettings): List<DraftNode> {
        var roots = source
        operations.forEach { operation ->
            var foundNode: DraftNode? = null
            var foundEntry: DraftEntry? = null
            fun find(node: DraftNode) {
                if (node.logicalId == operation.targetId) foundNode = node
                node.content.forEach { entry ->
                    if (entry.logicalId == operation.targetId || entry.node?.logicalId == operation.targetId) foundEntry = entry
                    entry.node?.let(::find)
                }
            }
            roots.forEach(::find)
            val token = foundNode?.let { it.draftId ?: it.revisionId } ?: foundEntry?.let { it.draftId ?: it.revisionId }
            if (token != operation.expectedRevisionId) throw ConflictException("Stale or unknown unit '${operation.targetId}'", "stale_draft_unit")
            fun map(node: DraftNode, transform: (DraftNode) -> DraftNode): DraftNode = transform(node.copy(content = node.content.map { entry -> entry.node?.let { entry.copy(node = map(it, transform)) } ?: entry }))
            fun updateNodes(transform: (DraftNode) -> DraftNode) {
                roots = roots.map { map(it, transform) }
            }
            fun targetText(transform: (DraftEntry) -> List<DraftEntry>) {
                require(foundEntry?.type == "text") { "Operation requires a text entry" }
                updateNodes { node ->
                    if (node.content.any { it.logicalId == operation.targetId }) node.copy(draftId = operation.id, content = node.content.flatMap { entry -> if (entry.logicalId == operation.targetId) transform(entry) else listOf(entry) }) else node
                }
            }
            when (operation.type) {
                "insert_root" -> {
                    require(foundNode != null && roots.any { it.logicalId == operation.targetId }) { "Root insertion requires a source root" }
                    val child = operation.node ?: throw IllegalArgumentException("New root is required")
                    fun fresh(node: DraftNode) {
                        require(node.revisionId == null && node.draftId == null) { "Inserted roots cannot claim revisions" }
                        node.content.forEach { entry ->
                            require(entry.revisionId == null && entry.draftId == null) { "Inserted entries cannot claim revisions" }
                            entry.node?.let(::fresh)
                        }
                    }
                    fresh(child)
                    val position = operation.position ?: throw IllegalArgumentException("Root position is required")
                    require(position in 0..roots.size) { "Invalid root position" }
                    roots = roots.take(position) + markInserted(child, operation.id) + roots.drop(position)
                }
                "move_root" -> {
                    val root = roots.find { it.logicalId == operation.targetId } ?: throw IllegalArgumentException("Root required")
                    val retained = roots.filter { it.logicalId != root.logicalId }
                    val position = operation.position ?: throw IllegalArgumentException("Root position is required")
                    require(position in 0..retained.size) { "Invalid root position" }
                    roots = retained.take(position) + root + retained.drop(position)
                }
                "replace_text" -> targetText { listOf(it.copy(text = operation.text ?: throw IllegalArgumentException("text is required"), draftId = operation.id)) }
                "set_metadata" -> {
                    require(foundNode != null) { "Metadata belongs to nodes, not parent text" }
                    updateNodes { if (it.logicalId == operation.targetId) it.copy(title = operation.title, label = operation.label, draftId = operation.id) else it }
                }
                "insert_text", "insert_child" -> {
                    require(foundNode != null) { "Insertion target must be a parent" }
                    val entry = if (operation.type == "insert_text") {
                        val part = operation.parts.singleOrNull() ?: throw IllegalArgumentException("insert_text requires one explicitly identified text part")
                        DraftEntry("text", logicalId = part.logicalId, draftId = operation.id, text = part.text)
                    } else {
                        val child = operation.node ?: throw IllegalArgumentException("insert_child requires a node")
                        fun newNode(node: DraftNode) {
                            require(node.revisionId == null && node.draftId == null) { "Inserted nodes cannot claim source revisions" }
                            node.content.forEach { entry ->
                                require(entry.revisionId == null && entry.draftId == null) { "Inserted text cannot claim source revisions" }
                                entry.node?.let(::newNode)
                            }
                        }
                        newNode(child)
                        DraftEntry("child", node = markInserted(child, operation.id))
                    }
                    updateNodes { node -> if (node.logicalId == operation.targetId) node.copy(draftId = operation.id, content = insert(node.content, entry, operation.position)) else node }
                }
                "remove" -> {
                    roots = roots.filter { it.logicalId != operation.targetId }
                    updateNodes { node ->
                        val entries = node.content.filter { it.logicalId != operation.targetId && it.node?.logicalId != operation.targetId }
                        if (entries.size == node.content.size) node else node.copy(content = entries, draftId = operation.id)
                    }
                }
                "split_text" -> targetText { entry ->
                    require(operation.parts.size >= 2 && operation.parts.joinToString("") { it.text } == entry.text) { "Split must preserve exact text and provide at least two parts" }
                    operation.parts.map { DraftEntry("text", logicalId = it.logicalId, draftId = operation.id, text = it.text) }
                }
                "merge_text" -> {
                    require(operation.mergeIds.size >= 2 && operation.mergeIds.first() == operation.targetId && operation.mergeIds.distinct().size == operation.mergeIds.size) { "Merge requires distinct adjacent text identities" }
                    var merged = false
                    updateNodes { node ->
                        val first = node.content.indexOfFirst { it.logicalId == operation.targetId }
                        if (first < 0) {
                            node
                        } else {
                            val entries = node.content.drop(first).take(operation.mergeIds.size)
                            require(entries.map { it.logicalId } == operation.mergeIds && entries.all { it.type == "text" }) { "Merge cannot cross a child boundary" }
                            val part = operation.parts.singleOrNull() ?: throw IllegalArgumentException("Merge requires one new text identity")
                            require(part.text == entries.joinToString("") { it.text.orEmpty() }) { "Merge must preserve exact text" }
                            merged = true
                            node.copy(draftId = operation.id, content = node.content.take(first) + DraftEntry("text", logicalId = part.logicalId, draftId = operation.id, text = part.text) + node.content.drop(first + entries.size))
                        }
                    }
                    require(merged) { "Merge target not found" }
                }
                "move" -> {
                    val moving = foundEntry ?: throw IllegalArgumentException("Move requires an entry under a parent")
                    val destination = operation.destinationParentId ?: throw IllegalArgumentException("Move requires an explicit destination parent")
                    require(destination != operation.targetId) { "A node cannot contain itself" }
                    var destinationNode: DraftNode? = null
                    fun findDestination(node: DraftNode) {
                        if (node.logicalId == destination) destinationNode = node
                        node.content.mapNotNull { it.node }.forEach(::findDestination)
                    }
                    roots.forEach(::findDestination)
                    val destinationToken = destinationNode?.let { it.draftId ?: it.revisionId }
                    if (destinationToken != operation.destinationRevisionId) throw ConflictException("Stale destination parent", "stale_draft_unit")
                    updateNodes { node ->
                        val retained = node.content.filter { it.logicalId != operation.targetId && it.node?.logicalId != operation.targetId }
                        if (retained.size == node.content.size) node else node.copy(content = retained, draftId = operation.id)
                    }
                    var inserted = false
                    updateNodes { node ->
                        if (node.logicalId == destination) {
                            inserted = true
                            node.copy(draftId = operation.id, content = insert(node.content, moving, operation.position))
                        } else {
                            node
                        }
                    }
                    require(inserted) { "Move destination cannot be inside the moved subtree" }
                }
                else -> throw IllegalArgumentException("Unknown draft operation '${operation.type}'")
            }
        }
        validate(roots, settings)
        return roots
    }

    private fun markInserted(node: DraftNode, id: UUID): DraftNode = node.copy(draftId = id, content = node.content.map { entry -> entry.node?.let { entry.copy(node = markInserted(it, id)) } ?: entry.copy(draftId = id) })

    private fun insert(entries: List<DraftEntry>, entry: DraftEntry, position: Int?): List<DraftEntry> {
        val index = position ?: throw IllegalArgumentException("Explicit insertion position is required")
        require(index in 0..entries.size) { "Insertion position is outside the parent sequence" }
        return entries.take(index) + entry + entries.drop(index)
    }

    fun validate(roots: List<DraftNode>, settings: DraftSettings) {
        val ids = mutableSetOf<UUID>()
        fun walk(node: DraftNode, depth: Int) {
            require(depth < 128 && ids.add(node.logicalId)) { "Duplicate or cyclic node identity '${node.logicalId}'" }
            val level = settings.outline.kinds.getOrNull(depth) ?: throw IllegalArgumentException("Unexpected level at '${node.logicalId}'")
            require(node.kind == level.kindCode) { "Invalid kind/parentage at '${node.logicalId}'" }
            require(level.titlePolicy != "required" || !node.title.isNullOrBlank()) { "Title required at '${node.logicalId}'" }
            require(level.titlePolicy != "none" || node.title.isNullOrEmpty()) { "Title forbidden at '${node.logicalId}'" }
            require(level.labelPolicy != "required" || !node.label.isNullOrBlank()) { "Literal label required at '${node.logicalId}'" }
            require(level.labelPolicy != "none" || node.label.isNullOrEmpty()) { "Literal label forbidden at '${node.logicalId}'" }
            node.content.forEach { entry ->
                when (entry.type) {
                    "text" -> require(level.mayHoldText && entry.node == null && entry.text != null && entry.logicalId != null && ids.add(entry.logicalId)) { "Invalid or duplicate text entry at '${node.logicalId}'" }
                    "child" -> {
                        require(level.mayHoldChildren && entry.node != null && entry.logicalId == null && entry.text == null && entry.node.kind in level.allowedChildKinds) { "Invalid child at '${node.logicalId}'" }
                        walk(entry.node!!, depth + 1)
                    }
                    else -> throw IllegalArgumentException("Invalid entry type '${entry.type}'")
                }
            }
        }
        roots.forEach { walk(it, 0) }
    }
}
