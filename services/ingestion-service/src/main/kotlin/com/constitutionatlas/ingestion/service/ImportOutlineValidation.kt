package com.constitutionatlas.ingestion.service

import com.constitutionatlas.ingestion.api.ImportOutlineKind

/**
 * Resolves one selected outline for ordered and legacy validation.
 *
 * Membership uses normalized codes, while root and parent lookup retain stored codes for
 * compatibility. An explicit empty child list means leaf; only null infers the next level.
 */
internal class ImportOutlineValidation(private val kinds: List<ImportOutlineKind>) {
    private val byCode = kinds.associateBy { it.kindCode }
    val allowedKinds: Set<String> = normalizedKinds()
    val rootKinds: Set<String> = selectedRootKinds()
    val configured: Boolean get() = kinds.isNotEmpty()

    /** Keeps normalized membership separate from raw root and parent lookups. */
    private fun normalizedKinds(): Set<String> = kinds.map { it.kindCode.trim().lowercase() }.filter { it.isNotBlank() }.toSet().ifEmpty { setOf("article") }

    /** Explicit roots win; otherwise the first level, or article for an empty outline, is the root. */
    private fun selectedRootKinds(): Set<String> = kinds.filter { it.root == true }.map { it.kindCode }.toSet().ifEmpty { setOf(kinds.firstOrNull()?.kindCode ?: "article") }

    /** Uses the last matching declaration's first structurally equal list position for implicit children. */
    fun children(kind: String): List<String> = byCode[kind]?.let { childrenAt(kinds.indexOf(it)) }.orEmpty()

    /** Text is forbidden only when explicitly disabled on a level with configured children. */
    fun forbidsText(kind: String): Boolean = byCode[kind]?.allowTextAlongsideChildren == false && children(kind).isNotEmpty()

    /** Checks sentence policy in declaration order, including outlines supplied without articles. */
    fun sentenceErrors(): List<Pair<String, String>> = buildList {
        kinds.forEachIndexed { index, kind ->
            if (invalidSegmentation(kind, childrenAt(index))) {
                add("SENTENCE_SEGMENTATION" to "outline.kinds[$index]: automatic sentence creation requires a leaf level without required labels or titles")
            }
            if (invalidDelimiters(kind)) {
                add("SENTENCE_DELIMITERS" to "outline.kinds[$index]: use at most 16 unique punctuation delimiters of 1 to 8 Unicode characters")
            }
        }
    }

    /** Sentence validation uses each declaration's own position, even for duplicate kind codes. */
    private fun childrenAt(index: Int): List<String> = kinds[index].allowedChildKinds ?: kinds.getOrNull(index + 1)?.let { listOf(it.kindCode) }.orEmpty()

    /** Automatic segmentation requires a leaf with optional heading metadata. */
    private fun invalidSegmentation(kind: ImportOutlineKind, children: List<String>): Boolean =
        kind.segmentation !in setOf("plain", "sentence") ||
            kind.segmentation == "sentence" &&
            (children.isNotEmpty() || kind.titlePolicy == "required" || kind.labelPolicy == "required")

    /** Delimiter lengths count Unicode code points; plain levels may explicitly use an empty list. */
    private fun invalidDelimiters(kind: ImportOutlineKind): Boolean {
        val delimiters = kind.sentenceDelimiters ?: listOf(".", "!", "?")
        return delimiters.size > 16 ||
            delimiters.distinct().size != delimiters.size ||
            kind.segmentation == "sentence" &&
            delimiters.isEmpty() ||
            delimiters.any {
                it.isEmpty() || it.codePointCount(0, it.length) > 8 || !it.matches(Regex("[\\p{P}\\p{S}]+"))
            }
    }
}
