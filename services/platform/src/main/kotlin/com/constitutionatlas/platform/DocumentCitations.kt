package com.constitutionatlas.platform

/** Full traversal includes note bodies and preserves distinct revisions of the same source. */
fun OrderedSnapshot.documentCitations(): List<OrderedReferenceTarget> {
    val citations = mutableListOf<OrderedReferenceTarget>()
    fun visit(node: OrderedNode) {
        node.content.forEach { entry ->
            entry.node?.let(::visit)
            citations += entry.references.map { it.target }.filter { it.type == "document" }
        }
    }
    roots.forEach(::visit)
    return citations.distinctBy { it.documentId to it.documentRevision }
}
