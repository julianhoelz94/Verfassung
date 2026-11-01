package com.constitutionatlas.catalog.service

import com.constitutionatlas.catalog.api.OutlineKindWrite

/** Canonical outline authoring policy, retaining layer-first and then graph validation precedence. */
internal object CatalogOutlineNormalization {
    private val kindCode = Regex("^[a-z][a-z0-9_-]{0,31}$")

    /** Uses raw declaration order for inferred children and preserves every explicitly supplied capability. */
    fun normalize(kinds: List<OutlineKindWrite>): List<OutlineKindWrite> {
        require(kinds.isNotEmpty()) { "outline must have at least one layer" }
        val normalized = kinds.mapIndexed { index, kind -> normalizeLayer(kind, index, kinds) }
        validateGraph(normalized)
        return normalized
    }

    /** Each layer's local policy fails before duplicate codes or cross-layer graph checks. */
    private fun normalizeLayer(kind: OutlineKindWrite, index: Int, kinds: List<OutlineKindWrite>): OutlineKindWrite {
        val code = kind.kindCode.trim().lowercase()
        val label = kind.displayLabel.trim()
        val presentation = kind.presentation.trim().lowercase()
        require(kindCode.matches(code)) { "kindCode '$code' must be a lowercase slug" }
        require(label.isNotBlank()) { "displayLabel is required for layer ${index + 1}" }
        require(presentation == "section" || presentation == "concatenated") { "presentation must be section or concatenated" }
        val children = kind.allowedChildKinds?.map { it.trim().lowercase() }
            ?: kinds.getOrNull(index + 1)?.let { listOf(it.kindCode.trim().lowercase()) }.orEmpty()
        if (code == "sentence" && children.isNotEmpty()) throw IllegalArgumentException("sentence cannot have child units")
        if (children.isEmpty() && kind.allowTextAlongsideChildren) throw IllegalArgumentException("a leaf has no child units")
        validatePresentation(kind, children)
        validateSegmentation(kind, children)
        return kind.copy(kindCode = code, displayLabel = label, presentation = presentation, root = kind.root ?: (index == 0), allowedChildKinds = children)
    }

    /** Public heading display cannot require authoring capabilities explicitly forbidden by that layer. */
    private fun validatePresentation(kind: OutlineKindWrite, children: List<String>) {
        if (kind.titlePolicy !in setOf("none", "optional", "required") || kind.labelPolicy !in setOf("none", "optional", "required")) {
            throw IllegalArgumentException("titlePolicy and labelPolicy must be none, optional or required")
        }
        if (kind.showTitle && kind.titlePolicy == "none") throw IllegalArgumentException("public title display requires editor title permission")
        if (kind.showLabel && kind.labelPolicy == "none") throw IllegalArgumentException("public label display requires literal label permission")
        if (kind.labelPlacement !in setOf("before_title", "after_title", "inline", "superscript")) {
            throw IllegalArgumentException("labelPlacement must be before_title, after_title, inline or superscript")
        }
        if (kind.labelPlacement == "superscript" && children.isNotEmpty()) throw IllegalArgumentException("superscript labels are only available on a leaf")
    }

    /** Automatic sentence creation requires a leaf without mandatory heading fields, then bounded punctuation. */
    private fun validateSegmentation(kind: OutlineKindWrite, children: List<String>) {
        if (kind.segmentation !in setOf("plain", "sentence") || (kind.segmentation == "sentence" && (children.isNotEmpty() || kind.labelPolicy == "required" || kind.titlePolicy == "required"))) {
            throw IllegalArgumentException("automatic sentence creation requires a leaf with optional or disallowed labels and titles")
        }
        if (kind.sentenceDelimiters.size > 16 || kind.sentenceDelimiters.distinct().size != kind.sentenceDelimiters.size || kind.sentenceDelimiters.any(::invalidDelimiter) || (kind.segmentation == "sentence" && kind.sentenceDelimiters.isEmpty())) {
            throw IllegalArgumentException("sentenceDelimiters must contain up to 16 unique punctuation sequences of 1 to 8 characters; automatic sentence creation requires at least one")
        }
    }

    /** Length is measured in Unicode code points rather than UTF-16 units. */
    private fun invalidDelimiter(delimiter: String): Boolean = delimiter.isEmpty() || delimiter.codePointCount(0, delimiter.length) > 8 || !delimiter.matches(Regex("[\\p{P}\\p{S}]+"))

    /** Identity and edge checks precede root-ordered cycle/reachability traversal. */
    private fun validateGraph(normalized: List<OutlineKindWrite>) {
        require(normalized.map { it.kindCode }.toSet().size == normalized.size) { "kindCode values must be unique" }
        val byCode = normalized.associateBy { it.kindCode }
        require(normalized.any { it.root == true }) { "outline needs a root kind" }
        normalized.forEach { kind ->
            val children = kind.allowedChildKinds.orEmpty()
            require(children.size == children.distinct().size) { "duplicate child kind for '${kind.kindCode}'" }
            children.forEach { child -> require(child in byCode) { "unknown child kind '$child' for '${kind.kindCode}'" } }
        }
        val visited = mutableSetOf<String>()

        /** Check the current ancestry before the visited shortcut so a cycle through a seen node still fails. */
        fun visit(code: String, path: Set<String>) {
            if (code in path) throw IllegalArgumentException("outline cycle at '$code'")
            if (!visited.add(code)) return
            byCode.getValue(code).allowedChildKinds.orEmpty().forEach { visit(it, path + code) }
        }
        normalized.filter { it.root == true }.forEach { visit(it.kindCode, emptySet()) }
        require(visited.size == normalized.size) { "every kind must be reachable from a root" }
    }
}
