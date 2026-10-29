package com.constitutionatlas.editor.service

import com.constitutionatlas.editor.ConflictException
import com.constitutionatlas.editor.api.DraftEntry
import com.constitutionatlas.editor.api.DraftNode
import com.constitutionatlas.editor.api.DraftOperation
import com.constitutionatlas.editor.client.DraftSettings
import com.constitutionatlas.platform.OrderedContentPosition
import com.constitutionatlas.platform.OrderedContentRules
import com.constitutionatlas.platform.OrderedInlineReference
import com.constitutionatlas.platform.OrderedTextMark
import java.util.UUID

object StructuredDraftEngine {
    fun replay(source: List<DraftNode>, operations: List<DraftOperation>, settings: DraftSettings, enforceEndnotes: Boolean = true): List<DraftNode> {
        var roots = source
        operations.forEach { operation ->
            operation.lineBreaksBefore?.let { count ->
                require(operation.type == "replace_text" && operation.format != null) { "A text separator update requires a rich replace_text operation" }
                OrderedContentRules.requireValid(OrderedContentRules.lineBreakErrors(count, "text", "operations[${operation.id}].lineBreaksBefore", operation.targetId))
            }
            operation.parts.forEachIndexed { index, part ->
                OrderedContentRules.requireValid(OrderedContentRules.lineBreakErrors(part.lineBreaksBefore, "text", "operations[${operation.id}].parts[$index].lineBreaksBefore", part.logicalId))
            }
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
            fun remapDraftTargets(replacements: Map<UUID, List<UUID>>) {
                updateNodes { node ->
                    val content = node.content.map { entry ->
                        val annotation = entry.annotation
                        val anchors = annotation?.anchorLogicalIds?.flatMap { replacements[it] ?: listOf(it) }?.distinct()
                        val references = entry.references.map { reference ->
                            val replacement = if (reference.target.type == "unit") replacements[reference.target.logicalId]?.firstOrNull() else null
                            if (replacement == null || replacement == reference.target.logicalId) reference else reference.copy(target = reference.target.copy(logicalId = replacement))
                        }
                        if (anchors == annotation?.anchorLogicalIds && references == entry.references) {
                            entry
                        } else {
                            entry.copy(draftId = operation.id, annotation = annotation?.copy(anchorLogicalIds = requireNotNull(anchors)), references = references)
                        }
                    }
                    if (content == node.content) node else node.copy(content = content, draftId = operation.id)
                }
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
                "replace_text" -> targetText {
                    listOf(
                        it.copy(
                            text = operation.text ?: throw IllegalArgumentException("text is required"),
                            draftId = operation.id,
                            format = operation.format ?: it.format,
                            table = if (operation.format != null) operation.table else it.table,
                            footnoteLabel = if (operation.format != null) operation.footnoteLabel else it.footnoteLabel,
                            references = if (operation.format != null) operation.references else it.references,
                            annotation = if (operation.format != null) operation.annotation else it.annotation,
                            marks = if (operation.format != null) operation.marks else it.marks,
                            lineBreaksBefore = if (operation.format != null) operation.lineBreaksBefore ?: it.lineBreaksBefore else it.lineBreaksBefore,
                        ),
                    )
                }
                "set_metadata" -> {
                    require(foundNode != null) { "Metadata belongs to nodes, not parent text" }
                    updateNodes { if (it.logicalId == operation.targetId) it.copy(title = operation.title, label = operation.label, draftId = operation.id) else it }
                }
                "insert_text", "insert_child" -> {
                    require(foundNode != null) { "Insertion target must be a parent" }
                    val entry = if (operation.type == "insert_text") {
                        val part = operation.parts.singleOrNull() ?: throw IllegalArgumentException("insert_text requires one explicitly identified text part")
                        DraftEntry("text", logicalId = part.logicalId, draftId = operation.id, text = part.text, format = part.format, table = part.table, footnoteLabel = part.footnoteLabel, references = part.references, annotation = part.annotation, marks = part.marks, lineBreaksBefore = part.lineBreaksBefore)
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
                    operation.replacementId?.let { replacement ->
                        var successor: DraftNode? = null
                        fun findReplacement(node: DraftNode) {
                            if (node.logicalId == replacement) successor = node
                            node.content.mapNotNull { it.node }.forEach(::findReplacement)
                        }
                        roots.forEach(::findReplacement)
                        require(replacement != operation.targetId && foundNode != null && successor?.kind == foundNode!!.kind) { "A removed unit's replacement must be a distinct surviving unit of the same kind" }
                    }
                    roots = roots.filter { it.logicalId != operation.targetId }
                    updateNodes { node ->
                        val entries = node.content.filter { it.logicalId != operation.targetId && it.node?.logicalId != operation.targetId }
                        if (entries.size == node.content.size) node else node.copy(content = entries, draftId = operation.id)
                    }
                    operation.replacementId?.let { replacement ->
                        var survives = false
                        fun findSurvivor(node: DraftNode) {
                            if (node.logicalId == replacement) survives = true
                            node.content.mapNotNull { it.node }.forEach(::findSurvivor)
                        }
                        roots.forEach(::findSurvivor)
                        require(survives) { "The replacement cannot be inside the removed subtree" }
                        remapDraftTargets(mapOf(operation.targetId to listOf(replacement)))
                    }
                }
                "split_text" -> {
                    targetText { entry ->
                        require(operation.parts.size >= 2 && operation.parts.joinToString("") { it.text } == entry.text) { "Split must preserve exact text and provide at least two parts" }
                        require((entry.format == null || entry.format == "plain") && entry.table == null) { "Only plain text entries can be split" }
                        val boundaries = operation.parts.runningFold(0) { offset, part -> offset + part.text.length }
                        require(entry.references.none { ref -> boundaries.drop(1).dropLast(1).any { ref.start < it && it < ref.end } }) { "A split cannot cut an inline reference; move the boundary outside the reference" }
                        operation.parts.mapIndexed { index, part ->
                            val start = boundaries[index]
                            val end = boundaries[index + 1]
                            DraftEntry("text", logicalId = part.logicalId, draftId = operation.id, text = part.text, marks = sliceMarks(entry.marks, start, end), references = sliceReferences(entry.references, start, end), lineBreaksBefore = if (index == 0) entry.lineBreaksBefore else part.lineBreaksBefore)
                        }
                    }
                    remapDraftTargets(mapOf(operation.targetId to operation.parts.map { it.logicalId }))
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
                            require(entries.map { it.logicalId } == operation.mergeIds && entries.all { it.type == "text" && (it.format == null || it.format == "plain") && it.table == null }) { "Merge cannot cross a child or rich entry boundary" }
                            val part = operation.parts.singleOrNull() ?: throw IllegalArgumentException("Merge requires one new text identity")
                            require(part.text == entries.joinToString("") { it.text.orEmpty() }) { "Merge must preserve exact text" }
                            merged = true
                            var offset = 0
                            val marks = mutableListOf<OrderedTextMark>()
                            val references = mutableListOf<OrderedInlineReference>()
                            entries.forEach { entry ->
                                marks += entry.marks.map { it.copy(start = it.start + offset, end = it.end + offset) }
                                references += entry.references.map { it.copy(start = it.start + offset, end = it.end + offset) }
                                offset += entry.text.orEmpty().length
                            }
                            node.copy(draftId = operation.id, content = node.content.take(first) + DraftEntry("text", logicalId = part.logicalId, draftId = operation.id, text = part.text, marks = normalizeMarks(marks), references = references, lineBreaksBefore = entries.first().lineBreaksBefore) + node.content.drop(first + entries.size))
                        }
                    }
                    require(merged) { "Merge target not found" }
                    remapDraftTargets(operation.mergeIds.associateWith { listOf(operation.parts.single().logicalId) })
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
        validate(roots, settings, enforceEndnotes)
        return roots
    }

    fun requireFootnoteMarkers(roots: List<DraftNode>) {
        val notes = mutableListOf<OrderedContentPosition>()
        val references = mutableListOf<OrderedInlineReference>()
        fun walk(node: DraftNode, path: String) {
            node.content.forEachIndexed { index, entry ->
                val entryPath = "$path.content[$index]"
                entry.node?.let { walk(it, "$entryPath.node") } ?: run {
                    notes += OrderedContentPosition(entryPath, entry.logicalId, format = entry.format)
                    references += entry.references
                }
            }
        }
        roots.forEachIndexed { index, root -> walk(root, "roots[$index]") }
        OrderedContentRules.requireValid(OrderedContentRules.footnoteMarkerErrors(notes, references))
    }

    private fun markInserted(node: DraftNode, id: UUID): DraftNode = node.copy(draftId = id, content = node.content.map { entry -> entry.node?.let { entry.copy(node = markInserted(it, id)) } ?: entry.copy(draftId = id) })

    private fun insert(entries: List<DraftEntry>, entry: DraftEntry, position: Int?): List<DraftEntry> {
        val index = position ?: throw IllegalArgumentException("Explicit insertion position is required")
        require(index in 0..entries.size) { "Insertion position is outside the parent sequence" }
        return entries.take(index) + entry + entries.drop(index)
    }

    private fun sliceMarks(marks: List<OrderedTextMark>, start: Int, end: Int): List<OrderedTextMark> = marks.mapNotNull { mark ->
        val from = maxOf(start, mark.start)
        val until = minOf(end, mark.end)
        if (from < until) mark.copy(start = from - start, end = until - start) else null
    }

    private fun normalizeMarks(marks: List<OrderedTextMark>): List<OrderedTextMark> = buildList {
        marks.sortedWith(compareBy<OrderedTextMark> { it.type }.thenBy { it.start }.thenBy { it.end }).forEach { mark ->
            val previous = lastOrNull()
            if (previous?.type == mark.type && previous.end >= mark.start) set(lastIndex, previous.copy(end = maxOf(previous.end, mark.end))) else add(mark)
        }
    }

    private fun sliceReferences(references: List<OrderedInlineReference>, start: Int, end: Int): List<OrderedInlineReference> = references.filter { ref ->
        if (ref.start == ref.end) {
            (ref.start > start || start == 0 && ref.start == 0) && ref.start <= end
        } else {
            ref.start >= start && ref.end <= end
        }
    }.map { it.copy(start = it.start - start, end = it.end - start) }

    fun validate(roots: List<DraftNode>, settings: DraftSettings, enforceEndnotes: Boolean = true) {
        val ids = mutableSetOf<UUID>()
        val levels = settings.outline.kinds
        val byCode = levels.associateBy { it.kindCode }
        val rootKinds = levels.filter { it.root }.map { it.kindCode }.toSet().ifEmpty { setOfNotNull(levels.firstOrNull()?.kindCode) }
        fun walk(node: DraftNode, parent: com.constitutionatlas.editor.client.DraftLevel?, depth: Int) {
            require(depth < 128 && ids.add(node.logicalId)) { "Duplicate or cyclic node identity '${node.logicalId}'" }
            val level = byCode[node.kind] ?: throw IllegalArgumentException("Unknown kind '${node.kind}' at '${node.logicalId}'")
            require(if (parent == null) node.kind in rootKinds else node.kind in parent.allowedChildKinds) { "Invalid kind/parentage at '${node.logicalId}'" }
            require(level.titlePolicy != "required" || !node.title.isNullOrBlank()) { "Title required at '${node.logicalId}'" }
            require(level.titlePolicy != "none" || node.title.isNullOrEmpty()) { "Title forbidden at '${node.logicalId}'" }
            require(level.labelPolicy != "required" || !node.label.isNullOrBlank()) { "Literal label required at '${node.logicalId}'" }
            require(level.labelPolicy != "none" || node.label.isNullOrEmpty()) { "Literal label forbidden at '${node.logicalId}'" }
            node.content.forEach { entry ->
                when (entry.type) {
                    "text" -> require(level.mayHoldText && entry.node == null && entry.text != null && entry.logicalId != null && ids.add(entry.logicalId)) { "Invalid or duplicate text entry at '${node.logicalId}'" }
                    "child" -> {
                        require(level.mayHoldChildren && entry.node != null && entry.logicalId == null && entry.text == null && entry.node.kind in level.allowedChildKinds) { "Invalid child at '${node.logicalId}'" }
                        require(entry.format == null && entry.table == null && entry.footnoteLabel == null && entry.references.isEmpty() && entry.annotation == null && entry.marks.isEmpty() && entry.lineBreaksBefore == 0) { "Text formatting belongs to text entries at '${node.logicalId}'" }
                        walk(entry.node!!, level, depth + 1)
                    }
                    else -> throw IllegalArgumentException("Invalid entry type '${entry.type}'")
                }
            }
        }
        roots.forEach { walk(it, null, 0) }
        val positions = mutableListOf<OrderedContentPosition>()
        val texts = mutableListOf<Pair<String, DraftEntry>>()
        fun collect(node: DraftNode, path: String) {
            positions += OrderedContentPosition(path, node.logicalId, node = true)
            node.content.forEachIndexed { index, entry ->
                val entryPath = "$path.content[$index]"
                entry.node?.let { collect(it, "$entryPath.node") } ?: run {
                    positions += OrderedContentPosition(entryPath, entry.logicalId, format = entry.format, text = entry.text)
                    texts += entryPath to entry
                }
            }
        }
        roots.forEachIndexed { index, root -> collect(root, "roots[$index]") }
        if (enforceEndnotes) OrderedContentRules.requireValid(OrderedContentRules.endnoteErrors(positions))
        val footnotes = texts.mapNotNull { (_, entry) -> entry.logicalId.takeIf { entry.format == "footnote" } }.toSet()
        texts.forEach { (path, entry) ->
            val format = entry.format ?: "plain"
            require(format in setOf("plain", "table", "footnote") && (format == "table") == (entry.table != null)) { "Invalid rich content format at $path" }
            require(format == "footnote" || entry.footnoteLabel == null && entry.annotation == null) { "Footnote fields require a footnote body at $path" }
            require(format != "footnote" || !entry.text.isNullOrBlank()) { "Footnote body is required at $path" }
            entry.annotation?.validate()
            require(entry.annotation?.anchorLogicalIds.orEmpty().all { it in ids }) { "Annotation has unknown unit anchor at $path" }
            OrderedContentRules.requireValid(OrderedContentRules.lineBreakErrors(entry.lineBreaksBefore, entry.type, "$path.lineBreaksBefore", entry.logicalId))
            OrderedContentRules.requireValid(OrderedContentRules.markErrors(entry.text.orEmpty(), format, entry.marks, "$path.marks", entry.logicalId))
            OrderedContentRules.requireValid(OrderedContentRules.referenceErrors(entry.text.orEmpty(), format, entry.references, footnotes, path, entry.logicalId, units = ids.takeIf { enforceEndnotes }))
        }
    }
}
