package com.constitutionatlas.catalog.service

import com.constitutionatlas.catalog.api.WikiCitation
import com.constitutionatlas.platform.scalarText
import tools.jackson.databind.JsonNode
import java.util.UUID

/** Closed, bounded document grammar. Documents store references, never client document metadata or HTML. */
object WikiRichText {
    private val blocks = setOf("paragraph", "heading", "blockquote", "bullet_list", "ordered_list")
    private val inlines = setOf("text", "hard_break", "citation")
    private val colors = setOf("#25332f", "#355a47", "#345b78", "#824b45", "#795719", "#66517d")
    private val uuid = Regex("^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$")

    fun body(document: JsonNode?, citations: List<WikiCitation>): String? {
        if (document == null || document.isNull) return null
        require(document.toString().length <= 200000) { "Wiki document is too large" }
        val state = Validation(citations.associate { it.documentId to it.revision })
        val text = state.node(document, "", 0).trim()
        require(text.length <= 20000) { "Wiki text must be at most 20,000 characters" }
        return text
    }

    private class Validation(private val pins: Map<UUID, Int>) {
        private var nodes = 0
        private val ids = mutableSetOf<String>()

        fun node(value: JsonNode, parent: String, depth: Int): String {
            require(++nodes <= 5000 && depth <= 12) { "Wiki document is too complex" }
            fields(value, setOf("type", "attrs", "text", "marks", "content"))
            val type = value.path("type").scalarText()
            require(type in allowed(parent)) { "Invalid Wiki document structure" }
            if (type == "text") return text(value)
            require(!value.has("text") && !value.has("marks")) { "Invalid Wiki block" }
            val prefix = attributes(value, type)
            if (type in setOf("citation", "hard_break")) {
                require(!value.has("content")) { "Invalid Wiki inline content" }
                return if (type == "hard_break") "\n" else ""
            }
            val children = children(value, type)
            val parts = children.map { node(it, type, depth + 1) }
            return when (type) {
                "heading" -> "${"#".repeat(prefix)} ${parts.joinToString("")}"
                "paragraph" -> parts.joinToString("")
                "bullet_list" -> parts.joinToString("\n") { "- $it" }
                "ordered_list" -> parts.mapIndexed { index, item -> "${prefix + index}. $item" }.joinToString("\n")
                "list_item" -> parts.joinToString("\n")
                else -> parts.joinToString("\n\n")
            }
        }

        private fun text(value: JsonNode): String {
            require(value.path("text").isTextual && value.path("text").scalarText().isNotEmpty() && !value.has("content") && !value.has("attrs")) { "Invalid Wiki text" }
            if (value.has("marks")) {
                val marks = value.path("marks")
                require(marks.isArray && marks.size() <= 4 && marks.toList().map { it.path("type").scalarText() }.distinct().size == marks.size()) { "Invalid Wiki text marks" }
                marks.forEach(::mark)
            }
            return value.path("text").scalarText()
        }

        private fun attributes(value: JsonNode, type: String): Int {
            if (type == "citation") {
                citation(value.path("attrs"))
                return 0
            }
            if (type in setOf("heading", "ordered_list")) {
                val key = if (type == "heading") "level" else "order"
                val attrs = value.path("attrs")
                fields(attrs, setOf(key))
                return integer(attrs.path(key), 1, if (type == "heading") 3 else 100000)
            }
            require(!value.has("attrs")) { "Unexpected Wiki attributes" }
            return 0
        }

        private fun citation(attrs: JsonNode) {
            fields(attrs, setOf("reference"))
            val reference = attrs.path("reference")
            fields(reference, setOf("id", "documentId", "revision", "locator"))
            val id = reference.path("id").scalarText()
            val documentId = reference.path("documentId").scalarText()
            require(reference.path("id").isTextual && uuid.matches(id) && ids.size < 1000 && ids.add(id.lowercase())) { "Invalid or duplicate Wiki citation id" }
            require(reference.path("documentId").isTextual && uuid.matches(documentId)) { "Invalid Wiki document id" }
            val revision = integer(reference.path("revision"), 1, Int.MAX_VALUE)
            require(pins[UUID.fromString(documentId)] == revision) { "Inline Wiki citations must use the page's exact document pins" }
            require(reference.path("locator").isTextual && reference.path("locator").scalarText().length <= 4000) { "Invalid Wiki page or passage" }
        }
    }

    private fun allowed(parent: String): Set<String> = when (parent) {
        "" -> setOf("doc")
        "doc", "blockquote", "list_item" -> blocks
        "bullet_list", "ordered_list" -> setOf("list_item")
        "paragraph", "heading" -> inlines
        else -> emptySet()
    }

    private fun children(value: JsonNode, type: String): List<JsonNode> {
        val children = value.get("content")
        require(children == null || children.isArray) { "Invalid Wiki content" }
        val items = children?.toList() ?: emptyList()
        require(type !in setOf("doc", "blockquote", "bullet_list", "ordered_list", "list_item") || items.isNotEmpty()) { "Missing Wiki content" }
        require(type != "list_item" || items.first().path("type").scalarText() == "paragraph") { "List items start with a paragraph" }
        return items
    }

    private fun mark(value: JsonNode) {
        fields(value, setOf("type", "attrs"))
        val type = value.path("type").scalarText()
        if (type in setOf("strong", "em", "underline") && !value.has("attrs")) return
        require(type == "text_color") { "Invalid Wiki text mark" }
        fields(value.path("attrs"), setOf("color"))
        require(value.path("attrs").path("color").scalarText() in colors) { "Invalid Wiki text color" }
    }

    private fun fields(value: JsonNode, allowed: Set<String>) {
        require(value.isObject && value.propertyNames().all { it in allowed }) { "Invalid or unknown Wiki document field" }
    }

    private fun integer(value: JsonNode, min: Int, max: Int): Int {
        require(value.isIntegralNumber && value.canConvertToInt() && value.asInt(0) in min..max) { "Invalid Wiki integer" }
        return value.asInt(0)
    }
}
