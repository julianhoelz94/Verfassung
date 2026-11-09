import com.constitutionatlas.document.api.DocumentDto
import com.constitutionatlas.document.api.DocumentRevisionDto
import com.constitutionatlas.document.service.BibtexCodec
import com.constitutionatlas.document.service.BibtexParser
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import java.time.OffsetDateTime
import java.util.UUID

class BibtexParserTest {
    private val parser = BibtexParser()

    @Test
    fun parsesMacrosNestedBracesQuotedValuesAndCorporateNamesWithoutLosingTeX() {
        val input = """
            % Bibliography with Unicode and TeX
            @string{journalName = "Constitutional " # {Studies}}
            @comment{ignored {nested} text}
            @article{Mueller2024,
              title = {The {EU}, federalism and M{\"u}ller},
              author = {M{\"u}ller, Anna and {Council of Europe and Partners}},
              journal = journalName,
              year = 2024,
              month = jan,
              note = "A quotation with {nested {braces}} and an escaped \"quote\"",
              file = {/a/local/path.pdf},
              x-custom = {Über den Staat}
            }
        """.trimIndent()
        val parsed = parser.parse(input)
        val entry = parsed.entries.single()
        assertEquals("Constitutional Studies", entry.fields["journal"])
        assertEquals("January", entry.fields["month"])
        val record = BibtexCodec.decode(entry)
        assertEquals("The EU, federalism and Müller", record.title)
        assertEquals("Müller", record.bibliography.authors[0].family)
        assertEquals("Council of Europe and Partners", record.bibliography.authors[1].literal)
        assertTrue(record.warnings.any { it.contains("Upload attachment") })
        val exported = BibtexCodec.encode(listOf(document(entry.key, record)))
        val roundTrip = parser.parse(exported).entries.single()
        assertEquals(entry.fields - "file", roundTrip.fields)
    }

    @Test
    fun editsEscapeLiteralTeXCharactersAndPreserveTitleCapitalization() {
        val record = BibtexCodec.decode(parser.parse("@misc{Original,title={Original},note={Keep {NASA}}}").entries.single())
        val original = document("Original", record)
        val updated = original.copy(revision = original.revision.copy(title = "NASA {Policy} & 50%_growth"))
        val output = BibtexCodec.encode(listOf(updated))
        assertTrue(output.contains("title = {{NASA \\{Policy\\} \\& 50\\%\\_growth}}"))
        val decoded = BibtexCodec.decode(parser.parse(output).entries.single())
        assertEquals("NASA {Policy} & 50%_growth", decoded.title)
        assertEquals("Keep NASA", decoded.bibliography.extra["note"])
    }

    @Test
    fun unsupportedMacrosMalformedEntriesAndDuplicateFieldsFailExplicitly() {
        listOf(
            "@article{Key,title=unresolved}",
            "@article{Key,title={unclosed}",
            "@article{Key,title={A},title={B}}",
            "@article",
            "@article{Key,title=}",
        ).forEach { input -> assertThrows(IllegalArgumentException::class.java) { parser.parse(input) } }
    }

    @Test
    fun parenthesesPreambleAndSuffixNamesHaveExplicitPreservation() {
        val parsed = parser.parse("""@preamble{"ignored"} @book(Key,title="A title",author={von Last, Jr, First},year={2024},date={2024-02-03},journal={Journal},booktitle={Book})""")
        assertTrue(parsed.warnings.single().contains("preamble"))
        val entry = parsed.entries.single()
        val record = BibtexCodec.decode(entry)
        val output = parser.parse(BibtexCodec.encode(listOf(document(entry.key, record)))).entries.single()
        assertEquals(entry.fields, output.fields)
    }

    @Test
    fun parserLimitsNestingAndEntryCounts() {
        assertThrows(IllegalArgumentException::class.java) { parser.parse("@misc{K,title={" + "{".repeat(101) + "x" + "}".repeat(101) + "}}") }
        assertThrows(IllegalArgumentException::class.java) { parser.parse((0..1000).joinToString("\n") { "@misc{Key$it,title={A}}" }) }
    }

    @Test
    fun legacyDescriptionsAndLiteralBackslashesSurviveExport() {
        val record = BibtexCodec.decode(parser.parse("@misc{Legacy,title={Legacy}} ").entries.single())
        val original = document("Legacy", record)
        val changed = original.copy(revision = original.revision.copy(description = "Archive C:\\sources & notes"))
        val roundTrip = BibtexCodec.decode(parser.parse(BibtexCodec.encode(listOf(changed))).entries.single())
        assertEquals("Archive C:\\sources & notes", roundTrip.description)
    }

    @Test
    fun multilineAndTabSeparatedAuthorsRemainDistinctPeople() {
        val entry = parser.parse("@article{Names,title={A title},author={Doe, Jane\nand Smith, John\tand\t{Council and Partners}}}").entries.single()
        val record = BibtexCodec.decode(entry)
        assertEquals(3, record.bibliography.authors.size)
        assertEquals("Doe", record.bibliography.authors[0].family)
        assertEquals("Smith", record.bibliography.authors[1].family)
        assertEquals("Council and Partners", record.bibliography.authors[2].literal)
        BibtexCodec.validateExtra(record.bibliography.extra)
        assertEquals(entry.fields, parser.parse(BibtexCodec.encode(listOf(document(entry.key, record)))).entries.single().fields)
    }

    @Test
    fun extraFieldsAreCaseInsensitiveAndCannotDuplicateCanonicalAuthors() {
        val record = BibtexCodec.decode(parser.parse("@misc{Key,title={Title},author={Smith, Jane}}").entries.single())
        val original = document("Key", record)
        val changed = original.copy(revision = original.revision.copy(bibliography = record.bibliography.copy(extra = record.bibliography.extra + mapOf("AUTHOR" to "Another author", "CUSTOM.FIELD" to "Retain me"))))
        val roundTrip = parser.parse(BibtexCodec.encode(listOf(changed))).entries.single()
        assertEquals("Smith, Jane", roundTrip.fields["author"])
        assertEquals("Retain me", roundTrip.fields["custom.field"])
        assertThrows(IllegalArgumentException::class.java) { BibtexCodec.validateExtra(changed.revision.bibliography.extra) }
    }

    @Test
    fun editingAnImportedNoteExportsItsNewValueRatherThanItsOldDescriptionCopy() {
        val record = BibtexCodec.decode(parser.parse("@misc{Key,title={Title},note={Original note}}").entries.single())
        val original = document("Key", record)
        val changed = original.copy(revision = original.revision.copy(bibliography = record.bibliography.copy(extra = record.bibliography.extra + ("note" to "Edited note"))))
        assertEquals("Edited note", parser.parse(BibtexCodec.encode(listOf(changed))).entries.single().fields["note"])
    }

    @Test
    fun abstractAndCatalogNoteHaveSeparateMeanings() {
        val entry = parser.parse("@article{Key,title={Source},abstract={Published author summary},note={Catalog description}}").entries.single()
        val decoded = BibtexCodec.decode(entry)
        assertEquals("Published author summary", decoded.bibliography.abstract)
        assertEquals("Catalog description", decoded.description)
        val abstractOnly = BibtexCodec.decode(parser.parse("@article{Key,title={Source},abstract={Published author summary}}").entries.single())
        assertEquals(null, abstractOnly.description)
        assertEquals("Published author summary", abstractOnly.bibliography.abstract)
    }

    private fun document(key: String, record: BibtexCodec.Record): DocumentDto {
        val id = UUID.randomUUID()
        val now = OffsetDateTime.now()
        return DocumentDto(
            id,
            1,
            "active",
            now,
            DocumentRevisionDto(
                UUID.randomUUID(), id, 1, record.title, record.description, record.sourceUrl,
                null, null, now, UUID.randomUUID(), key, record.bibliography,
            ),
            key,
        )
    }
}
