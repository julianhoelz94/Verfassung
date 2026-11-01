package com.constitutionatlas.ingestion.service

import com.constitutionatlas.ingestion.api.ImportOutlineKind
import com.constitutionatlas.platform.OrderedContentRules
import com.constitutionatlas.platform.OrderedNodeWrite

/** Validates representative sample trees against the reviewed outline without rewriting authored content. */
internal class SetupSampleValidation(private val kinds: List<ImportOutlineKind>) {
    private val byCode = kinds.associateBy { it.kindCode }

    /** Check display permissions before visiting roots in submitted order with the original root fallback. */
    fun validate(sampleRoots: List<OrderedNodeWrite>) {
        val roots = kinds.filter { it.root == true }.map { it.kindCode }.toSet().ifEmpty { setOfNotNull(kinds.firstOrNull()?.kindCode) }
        validateDisplay()
        sampleRoots.forEachIndexed { index, root -> visit(root, null, "sampleRoots[$index]", roots) }
    }

    /** An absent child policy uses the next submitted level; an explicit empty list remains a leaf. */
    private fun children(code: String): List<String> = byCode[code]?.let { level ->
        level.allowedChildKinds ?: kinds.getOrNull(kinds.indexOf(level) + 1)?.let { listOf(it.kindCode) }.orEmpty()
    }.orEmpty()

    /** Preserve per-kind title, label and superscript-leaf rejection order. */
    private fun validateDisplay() {
        kinds.forEach { kind ->
            if (kind.showTitle && kind.titlePolicy == "none") invalidSetupProposal("outline.kinds", "title display requires title permission")
            if (kind.showLabel && kind.labelPolicy == "none") invalidSetupProposal("outline.kinds", "label display requires label permission")
            if (kind.labelPlacement == "superscript" && children(kind.kindCode).isNotEmpty()) invalidSetupProposal("outline.kinds", "superscript labels require a leaf kind")
        }
    }

    /** Reject kind/parent/text rules before each entry's line breaks and depth-first child subtree. */
    private fun visit(node: OrderedNodeWrite, parent: String?, path: String, roots: Set<String>) {
        val kind = node.kind.orEmpty()
        if (kind !in byCode) invalidSetupProposal(path, "unknown kind '$kind'")
        if (parent == null && kind !in roots) invalidSetupProposal(path, "kind '$kind' is not an allowed root")
        if (parent != null && kind !in children(parent)) invalidSetupProposal(path, "kind '$kind' is not allowed under '$parent'")
        if (node.content.orEmpty().any { it.type == "text" } && children(kind).isNotEmpty() && byCode[kind]?.allowTextAlongsideChildren != true) {
            invalidSetupProposal(path, "text alongside child units is not allowed in '$kind'")
        }
        node.content.orEmpty().forEachIndexed { index, entry ->
            OrderedContentRules.lineBreakErrors(entry.lineBreaksBefore, entry.type, "$path.content[$index].lineBreaksBefore", entry.logicalId).firstOrNull()?.let { invalidSetupProposal(it.path, it.detail) }
            entry.node?.let { visit(it, kind, "$path.content[$index].node", roots) }
        }
    }
}
