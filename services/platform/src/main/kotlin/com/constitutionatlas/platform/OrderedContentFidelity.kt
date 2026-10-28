package com.constitutionatlas.platform

/** A retry may reuse an already persisted snapshot only when every supplied value agrees. */
object OrderedContentFidelity {
    fun matches(expected: List<OrderedNodeWrite>, actual: List<OrderedNode>): Boolean {
        fun node(left: OrderedNodeWrite, right: OrderedNode): Boolean =
            (left.logicalId == null || left.logicalId == right.logicalId) &&
                (left.kind == null || left.kind == right.kind) &&
                left.label == right.label &&
                left.title == right.title &&
                left.content.orEmpty().size == right.content.size &&
                left.content.orEmpty().zip(right.content).all { (a, b) ->
                    a.type == b.type &&
                        if (a.type == "child") {
                            a.node != null && b.node != null && node(a.node, b.node)
                        } else {
                            (a.logicalId == null || a.logicalId == b.logicalId) &&
                                (a.text == b.text || a.text == null && a.format == "table") &&
                                (a.format ?: "plain") == (b.format ?: "plain") &&
                                a.table == b.table &&
                                a.footnoteLabel == b.footnoteLabel &&
                                a.references == b.references &&
                                a.annotation == b.annotation &&
                                a.marks == b.marks &&
                                (a.lineage.isEmpty() || a.lineage == b.lineage)
                        }
                }
        return expected.size == actual.size && expected.zip(actual).all { (left, right) -> node(left, right) }
    }
}
