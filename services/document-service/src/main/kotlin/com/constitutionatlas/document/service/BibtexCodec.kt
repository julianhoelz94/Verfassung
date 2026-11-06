package com.constitutionatlas.document.service

import com.constitutionatlas.document.api.BibliographyDto
import com.constitutionatlas.document.api.DocumentDto
import com.constitutionatlas.document.service.BibtexText.balanced
import com.constitutionatlas.document.service.BibtexText.formatNames
import com.constitutionatlas.document.service.BibtexText.names

/** Maps common fields and retains original TeX for unchanged, lossless export. */
object BibtexCodec {
    data class Record(
        val title: String,
        val bibliography: BibliographyDto,
        val sourceUrl: String?,
        val description: String?,
        val warnings: List<String>,
    )

    private const val RAW = "\$bibtex.raw."
    private const val VALUE = "\$bibtex.value."
    private val fieldName = Regex("[a-zA-Z][a-zA-Z0-9_:.-]*")
    private val keyPattern = Regex("[A-Za-z][A-Za-z0-9_:-]{0,127}")
    private val knownFields = setOf(
        "title", "author", "editor", "year", "date", "journal", "booktitle", "publisher", "volume",
        "number", "pages", "doi", "isbn", "language", "abstract", "url",
    )

    fun validateExtra(extra: Map<String, String>) {
        val ordinary = extra.keys.filter { !it.startsWith(RAW) && !it.startsWith(VALUE) }
        require(ordinary.map(String::lowercase).distinct().size == ordinary.size) { "Additional bibliography field names must be unique regardless of case" }
        ordinary.forEach { name ->
            require(fieldName.matches(name)) { "Additional bibliography field names must use BibTeX identifiers" }
            if (name.lowercase() in knownFields + setOf("note", "type")) {
                require(name == name.lowercase() && RAW + name in extra && VALUE + name in extra) { "Use the bibliography's dedicated field instead of an additional $name field" }
            }
        }
        extra.keys.filter { it.startsWith(RAW) || it.startsWith(VALUE) }.forEach { key ->
            val field = key.removePrefix(RAW).removePrefix(VALUE)
            require(field == field.lowercase() && fieldName.matches(field) && RAW + field in extra && VALUE + field in extra) { "Imported bibliography source fields require valid, paired names" }
            val raw = extra.getValue(RAW + field)
            require(balanced(raw)) { "Imported bibliography source contains unbalanced TeX" }
            val decoded = if (field in setOf("author", "editor")) formatNames(names(raw)) else text(raw)
            require(extra.getValue(VALUE + field) == decoded) { "Imported bibliography source does not match its normalized value" }
        }
    }

    fun decode(entry: BibtexParser.Entry): Record {
        val fields = entry.fields.mapValues { text(it.value) }
        val warnings = mutableListOf<String>()
        val title = fields["title"]?.takeIf(String::isNotBlank) ?: entry.key.also {
            warnings.add("The entry has no title; its citation key is used as the title.")
        }
        if (!keyPattern.matches(entry.key)) warnings.add("Choose a valid citation key before importing this entry.")
        if ("file" in fields) warnings.add("File references are retained as metadata. Upload attachment files separately.")
        if ("crossref" in fields || "xdata" in fields) warnings.add("Cross-references are retained as metadata; inherited fields are not expanded.")
        val source = fields["url"]?.takeIf(String::isNotBlank)
        if (source != null && (!validUrl(source) || source.length > 2048)) warnings.add("The URL cannot be used as a source link; it is retained as metadata instead.")
        val extra = fields.filterKeys { it !in knownFields }.toMutableMap()
        if ("date" in fields && "year" in fields) extra["year"] = fields.getValue("year")
        if ("journal" in fields && "booktitle" in fields) extra["booktitle"] = fields.getValue("booktitle")
        if (source != null && (!validUrl(source) || source.length > 2048)) extra["url"] = source
        val authors = names(entry.fields["author"])
        val editors = names(entry.fields["editor"])
        val bibliography = BibliographyDto(
            type = entry.type,
            authors = authors,
            editors = editors,
            issued = fields["date"] ?: fields["year"],
            containerTitle = fields["journal"] ?: fields["booktitle"],
            publisher = fields["publisher"],
            volume = fields["volume"],
            issue = fields["number"],
            pages = fields["pages"],
            doi = fields["doi"],
            isbn = fields["isbn"],
            language = fields["language"],
            abstract = fields["abstract"],
            extra = extra,
        )
        // Author normalization may change display order. Remember the normalized value as well
        // as its source representation, so unchanged names still round-trip exactly.
        val canonical = fields.toMutableMap()
        if ("author" in fields) canonical["author"] = formatNames(authors)
        if ("editor" in fields) canonical["editor"] = formatNames(editors)
        entry.fields.forEach { (name, raw) ->
            extra[RAW + name] = raw
            extra[VALUE + name] = canonical.getValue(name)
        }
        val description = fields["abstract"] ?: fields["note"]
        if ((description?.length ?: 0) > 10000) warnings.add("The long description is retained in the bibliography without duplicating it as a description.")
        return Record(title, bibliography.copy(extra = extra), source?.takeIf { validUrl(it) && it.length <= 2048 }, description?.takeIf { it.length <= 10000 }, warnings)
    }

    fun encode(documents: List<DocumentDto>, attachmentPaths: Map<java.util.UUID, List<String>> = emptyMap()): String =
        BibtexWriter.encode(documents, attachmentPaths)

    fun text(raw: String): String = BibtexText.text(raw)

    private fun validUrl(value: String): Boolean = runCatching {
        val uri = java.net.URI(value)
        uri.scheme in setOf("http", "https") && !uri.host.isNullOrBlank()
    }.getOrDefault(false)
}
