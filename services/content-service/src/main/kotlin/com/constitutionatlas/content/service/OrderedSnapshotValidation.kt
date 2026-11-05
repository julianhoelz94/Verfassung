package com.constitutionatlas.content.service

import com.constitutionatlas.content.api.OrderedEntry
import com.constitutionatlas.content.api.OrderedNode
import com.constitutionatlas.content.client.StructuralLevel
import com.constitutionatlas.content.client.StructuralSettings
import com.constitutionatlas.platform.OrderedContentRules
import com.constitutionatlas.platform.OrderedTable
import java.util.UUID

/** One complete snapshot's hierarchy, global identities and rich-content validation state. */
internal class OrderedSnapshotValidation(settings: StructuralSettings) {
    private val identities = mutableSetOf<UUID>()
    private val levels = settings.outline.kinds
    private val byCode = levels.associateBy { it.kindCode }
    private val rootsAllowed = rootKinds()

    /** Complete hierarchy validation precedes global endnotes, rich entries, reference IDs and marker coverage. */
    fun validate(roots: List<OrderedNode>) {
        roots.forEach { walk(it, null) }
        OrderedContentRules.requireValid(OrderedContentRules.endnoteErrors(OrderedContentRules.positions(roots)))
        val footnotes = mutableSetOf<UUID>()
        roots.forEach { collectFootnotes(it, footnotes) }
        roots.forEach { rich(it, footnotes) }
        OrderedContentRules.requireValid(OrderedContentRules.referenceIdentityErrors(OrderedContentRules.positions(roots)))
        OrderedContentRules.requireValid(OrderedContentRules.footnoteMarkerErrors(roots))
    }

    /** Explicit roots take precedence, with the original first-level fallback when none are marked. */
    private fun rootKinds(): Set<String> = levels.filter { it.root }.map { it.kindCode }.toSet().ifEmpty { setOfNotNull(levels.firstOrNull()?.kindCode) }

    /** Node identity, kind, parent membership and heading policies are checked before authored entry order. */
    private fun walk(node: OrderedNode, parent: StructuralLevel?) {
        require(identities.add(node.logicalId)) { "Duplicate node logical identity '${node.logicalId}'" }
        val level = byCode[node.kind] ?: throw IllegalArgumentException("Unknown kind '${node.kind}' at '${node.logicalId}'")
        require(if (parent == null) node.kind in rootsAllowed else node.kind in parent.allowedChildKinds) {
            "Invalid kind '${node.kind}' at '${node.logicalId}' ${if (parent == null) "at the root" else "under '${parent.kindCode}'"}"
        }
        policy(node.title, level.titlePolicy, "Title", node.logicalId)
        policy(node.label, level.labelPolicy, "Literal label", node.logicalId)
        node.content.forEach { entry ->
            if (entry.type == "child") {
                require(level.mayHoldChildren && entry.node!!.kind in level.allowedChildKinds) { "Child kind is not permitted at '${node.logicalId}'" }
                walk(entry.node!!, level)
            } else {
                require(level.mayHoldText) { "Parent text is not permitted at '${node.logicalId}'" }
                require(identities.add(entry.logicalId!!)) { "Duplicate text logical identity '${entry.logicalId}'" }
            }
        }
    }

    /** Required headings reject blank wording; forbidden headings allow only null or exactly empty values. */
    private fun policy(value: String?, policy: String, field: String, logicalId: UUID) {
        require(policy != "required" || !value.isNullOrBlank()) { "$field is required at '$logicalId'" }
        require(policy != "none" || value.isNullOrEmpty()) { "$field is not permitted at '$logicalId'" }
    }

    /** All footnote identities are collected before reference checks, including targets in later roots. */
    private fun collectFootnotes(node: OrderedNode, footnotes: MutableSet<UUID>) {
        node.content.forEach { entry ->
            entry.node?.let { collectFootnotes(it, footnotes) }
            if (entry.format == "footnote") footnotes += requireNotNull(entry.logicalId)
        }
    }

    /** Child rich checks precede the containing entry's table, annotation and shared text validation. */
    private fun rich(node: OrderedNode, footnotes: Set<UUID>) {
        node.content.forEach { entry ->
            entry.node?.let { rich(it, footnotes) }
            entry.table?.let { table -> validateTable(table, entry.format, node.logicalId) }
            entry.annotation?.let { annotation ->
                annotation.validate()
                require(entry.format == "footnote") { "Annotations must be anchored notes" }
                require(annotation.anchorLogicalIds.all { it in identities }) { "Annotation has an unknown unit anchor" }
            }
            validateText(entry, node.logicalId, footnotes)
        }
    }

    /** Row and cell identities are local to each table; headers may target any marked header cell. */
    private fun validateTable(table: OrderedTable, format: String?, logicalId: UUID) {
        require(format == "table" && table.rows.isNotEmpty()) { "Table needs rows at '$logicalId'" }
        val rowIds = mutableSetOf<UUID>()
        val cellIds = mutableSetOf<UUID>()
        val headerIds = table.rows.flatMap { it.cells }.filter { it.header }.map { it.logicalId }.toSet()
        table.rows.forEach { row ->
            require(rowIds.add(row.logicalId) && row.cells.isNotEmpty()) { "Duplicate or empty table row at '$logicalId'" }
            row.cells.forEach { cell ->
                require(cellIds.add(cell.logicalId) && cell.rowSpan in 1..100 && cell.colSpan in 1..100) { "Invalid table cell at '$logicalId'" }
                require(cell.headers.all { it in headerIds }) { "Unknown table header at '$logicalId'" }
            }
        }
    }

    /** Separator, marks, footnote body and inline-reference failures retain their established order and paths. */
    private fun validateText(entry: OrderedEntry, logicalId: UUID, footnotes: Set<UUID>) {
        val path = "node[$logicalId].text[${entry.logicalId}]"
        OrderedContentRules.requireValid(OrderedContentRules.lineBreakErrors(entry.lineBreaksBefore, entry.type, "$path.lineBreaksBefore", entry.logicalId))
        OrderedContentRules.requireValid(OrderedContentRules.markErrors(entry.text.orEmpty(), entry.format, entry.marks, "$path.marks", entry.logicalId))
        if (entry.format == "footnote") require(!entry.text.isNullOrBlank() && entry.table == null) { "Footnote text is required at '$logicalId'" }
        OrderedContentRules.requireValid(OrderedContentRules.referenceErrors(entry.text.orEmpty(), entry.format, entry.references, footnotes, path, entry.logicalId, units = identities))
    }
}
