package com.constitutionatlas.document.service

import com.constitutionatlas.document.api.BibliographyDto
import com.constitutionatlas.document.api.CreatorDto
import com.constitutionatlas.document.api.DocumentDto
import com.constitutionatlas.document.service.BibtexText.balanced
import com.constitutionatlas.document.service.BibtexText.formatNames
import java.util.UUID

/** File references are generated exclusively from attachments included in the archive. */
internal object BibtexWriter {
    private const val RAW = "\$bibtex.raw."
    private const val VALUE = "\$bibtex.value."
    private val fieldName = Regex("[a-zA-Z][a-zA-Z0-9_:.-]*")
    private val keyPattern = Regex("[A-Za-z][A-Za-z0-9_:-]{0,127}")

    fun encode(documents: List<DocumentDto>, attachmentPaths: Map<UUID, List<String>>): String =
        documents.sortedWith(compareBy({ it.citationKey.lowercase() }, { it.id.toString() }))
            .joinToString("\n\n", postfix = if (documents.isEmpty()) "" else "\n") { document ->
                entry(document, attachmentPaths[document.id].orEmpty())
            }

    private fun entry(document: DocumentDto, attachments: List<String>): String {
        val bibliography = document.revision.bibliography
        require(keyPattern.matches(document.citationKey)) { "Cannot export an invalid citation key" }
        require(fieldName.matches(bibliography.type)) { "Cannot export an invalid bibliography type" }
        val fields = fields(document)
        addExtra(fields, bibliography.extra)
        if (attachments.isNotEmpty()) fields["file"] = attachments.joinToString(";")
        return "@${bibliography.type}{${document.citationKey},\n" + fields.entries.joinToString(",\n") { (name, value) ->
            "  $name = {${render(name, value, bibliography)}}"
        } + "\n}"
    }

    private fun fields(document: DocumentDto): LinkedHashMap<String, String> {
        val revision = document.revision
        val bibliography = revision.bibliography
        val fields = linkedMapOf("title" to revision.title)
        if (bibliography.authors.isNotEmpty()) fields["author"] = formatNames(bibliography.authors)
        if (bibliography.editors.isNotEmpty()) fields["editor"] = formatNames(bibliography.editors)
        bibliography.issued?.let { fields[if (it.matches(Regex("[0-9]{4}")) && RAW + "date" !in bibliography.extra) "year" else "date"] = it }
        bibliography.containerTitle?.let {
            val container = if (RAW + "journal" in bibliography.extra || bibliography.type == "article") "journal" else "booktitle"
            fields[container] = it
        }
        mapOf(
            "publisher" to bibliography.publisher, "volume" to bibliography.volume, "number" to bibliography.issue,
            "pages" to bibliography.pages, "doi" to bibliography.doi, "isbn" to bibliography.isbn,
            "language" to bibliography.language, "abstract" to bibliography.abstract, "url" to revision.sourceUrl,
        ).forEach { (name, value) -> if (!value.isNullOrBlank()) fields[name] = value }
        if (includeDescription(document)) fields["note"] = revision.description!!
        return fields
    }

    private fun includeDescription(document: DocumentDto): Boolean {
        val revision = document.revision
        return !revision.description.isNullOrBlank() &&
            revision.description != revision.bibliography.abstract &&
            revision.bibliography.extra.keys.none { it.equals("note", ignoreCase = true) }
    }

    private fun addExtra(fields: MutableMap<String, String>, extra: Map<String, String>) {
        extra.toSortedMap().forEach { (name, value) ->
            if (name.startsWith(RAW) || name.startsWith(VALUE) || name.equals("file", ignoreCase = true)) return@forEach
            require(fieldName.matches(name)) { "Cannot export unsupported bibliography field name: $name" }
            fields.putIfAbsent(name.lowercase(), value)
        }
    }

    private fun render(name: String, value: String, bibliography: BibliographyDto): String {
        val raw = bibliography.extra[RAW + name]
        val unchanged = bibliography.extra[VALUE + name] == value
        return when {
            name != "file" && raw != null && unchanged && balanced(raw) -> raw
            name == "author" && bibliography.authors.isNotEmpty() -> renderNames(bibliography.authors)
            name == "editor" && bibliography.editors.isNotEmpty() -> renderNames(bibliography.editors)
            name == "title" -> "{${escape(value)}}"
            else -> escape(value)
        }
    }

    private fun renderNames(creators: List<CreatorDto>): String = creators.joinToString(" and ") { creator ->
        creator.literal?.let { "{${escape(it)}}" } ?: listOfNotNull(creator.family?.let(::escape), creator.given?.takeIf(String::isNotBlank)?.let(::escape)).joinToString(", ")
    }

    private fun escape(value: String): String = buildString {
        value.forEach { c ->
            append(
                when (c) {
                    '\\' -> "\\textbackslash{}"
                    '{' -> "\\{"
                    '}' -> "\\}"
                    '&', '%', '$', '#', '_' -> "\\$c"
                    '~' -> "\\textasciitilde{}"
                    '^' -> "\\textasciicircum{}"
                    else -> c.toString()
                },
            )
        }
    }
}
