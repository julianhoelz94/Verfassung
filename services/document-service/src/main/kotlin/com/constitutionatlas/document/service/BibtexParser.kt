package com.constitutionatlas.document.service

/** Bounded BibTeX reader. Macro values are expanded; unsupported syntax fails explicitly. */
class BibtexParser {
    data class Entry(val type: String, val key: String, val fields: Map<String, String>)
    data class Result(val entries: List<Entry>, val warnings: List<String>)

    fun parse(content: String): Result {
        require(content.toByteArray(Charsets.UTF_8).size <= 5 * 1024 * 1024) { "BibTeX input exceeds 5 MB" }
        return Reader(content).read()
    }

    private class Reader(private val input: String) {
        private var position = 0
        private val macros = mutableMapOf(
            "jan" to "January", "feb" to "February", "mar" to "March", "apr" to "April",
            "may" to "May", "jun" to "June", "jul" to "July", "aug" to "August",
            "sep" to "September", "oct" to "October", "nov" to "November", "dec" to "December",
        )
        private val warnings = mutableListOf<String>()

        fun read(): Result {
            val entries = mutableListOf<Entry>()
            while (true) {
                whitespace()
                if (position == input.length) break
                require(peek() == '@') { "Expected an entry starting with @ at character ${position + 1}" }
                position++
                val type = identifier().lowercase()
                whitespace()
                require(position < input.length) { "Missing entry body after @$type" }
                val opening = take()
                require(opening == '{' || opening == '(') { "Expected { or ( after @$type" }
                val closing = if (opening == '{') '}' else ')'
                when (type) {
                    "comment" -> skipComment(opening, closing)
                    "preamble" -> {
                        value(closing)
                        commaAndClose(closing)
                        warnings.add("A BibTeX preamble was ignored; document records do not execute LaTeX preambles.")
                    }
                    "string" -> {
                        whitespace()
                        val name = identifier().lowercase()
                        expect('=')
                        macros[name] = value(closing)
                        commaAndClose(closing)
                    }
                    else -> {
                        require(entries.size < 1000) { "Import at most 1000 BibTeX entries at once" }
                        entries.add(entry(type, closing))
                    }
                }
            }
            require(entries.isNotEmpty()) { "No document entries were found" }
            return Result(entries, warnings.distinct())
        }

        private fun entry(type: String, closing: Char): Entry {
            whitespace()
            val start = position
            while (peek() != ',' && peek() != closing && position < input.length) position++
            val key = input.substring(start, position).trim()
            require(key.isNotEmpty()) { "A citation key is required at character ${start + 1}" }
            val fields = linkedMapOf<String, String>()
            if (peek() == ',') {
                position++
                whitespace()
                while (peek() != closing) {
                    require(position < input.length) { "Unclosed entry $key" }
                    val field = identifier().lowercase()
                    require(field.matches(Regex("[a-z][a-z0-9_:.-]*"))) { "Invalid BibTeX field name: $field" }
                    expect('=')
                    require(field !in fields) { "Duplicate field $field in $key" }
                    fields[field] = value(closing)
                    whitespace()
                    if (peek() == closing) break
                    expect(',')
                    whitespace()
                }
            }
            expect(closing)
            require(fields.size <= 200) { "Too many fields in $key" }
            return Entry(type, key, fields)
        }

        private fun value(closing: Char): String {
            val result = StringBuilder()
            do {
                whitespace()
                when (peek()) {
                    '{' -> result.append(group())
                    '"' -> result.append(quoted())
                    else -> {
                        val start = position
                        while (position < input.length && !peek().isWhitespace() && peek() !in setOf(',', '#', closing, '%')) position++
                        val token = input.substring(start, position)
                        require(token.isNotEmpty()) { "Missing field value at character ${position + 1}" }
                        result.append(
                            if (token.all(Char::isDigit)) {
                                token
                            } else {
                                macros[token.lowercase()] ?: throw IllegalArgumentException("Unresolved BibTeX string macro: $token")
                            },
                        )
                    }
                }
                require(result.length <= 100_000) { "BibTeX field exceeds 100000 characters" }
                whitespace()
                if (peek() != '#') break
                position++
            } while (true)
            return result.toString()
        }

        private fun group(): String {
            expect('{')
            val start = position
            var depth = 1
            while (position < input.length) {
                val c = take()
                if (c == '\\') {
                    if (position < input.length) position++
                } else if (c == '{') {
                    depth++
                    require(depth <= 100) { "BibTeX nesting exceeds 100 levels" }
                } else if (c == '}' && --depth == 0) {
                    return input.substring(start, position - 1)
                }
            }
            throw IllegalArgumentException("Unclosed braced BibTeX value")
        }

        private fun quoted(): String {
            expect('"')
            val start = position
            var depth = 0
            while (position < input.length) {
                when (take()) {
                    '\\' -> if (position < input.length) position++
                    '{' -> {
                        depth++
                        require(depth <= 100) { "BibTeX nesting exceeds 100 levels" }
                    }
                    '}' -> {
                        depth--
                        require(depth >= 0) { "Unbalanced braces in quoted BibTeX value" }
                    }
                    '"' -> if (depth == 0) return input.substring(start, position - 1)
                }
            }
            throw IllegalArgumentException("Unclosed quoted BibTeX value")
        }

        private fun skipComment(opening: Char, closing: Char) {
            var depth = 1
            while (position < input.length && depth > 0) {
                when (take()) {
                    '\\' -> if (position < input.length) position++
                    opening -> depth++
                    closing -> depth--
                }
            }
            require(depth == 0) { "Unclosed BibTeX comment" }
        }

        private fun commaAndClose(closing: Char) {
            whitespace()
            if (peek() == ',') position++
            expect(closing)
        }

        private fun identifier(): String {
            whitespace()
            val start = position
            while (position < input.length && (peek().isLetterOrDigit() || peek() in setOf('_', '-', ':', '.'))) position++
            require(position > start) { "Expected a BibTeX identifier at character ${position + 1}" }
            return input.substring(start, position)
        }

        private fun expect(c: Char) {
            whitespace()
            require(peek() == c) { "Expected $c at character ${position + 1}" }
            position++
        }

        private fun whitespace() {
            while (position < input.length) {
                if (peek().isWhitespace() || peek() == '\uFEFF') {
                    position++
                } else if (peek() == '%') {
                    while (position < input.length && take() != '\n') {
                        // Skip the rest of a BibTeX comment line.
                    }
                } else {
                    break
                }
            }
        }

        private fun peek(): Char = input.getOrNull(position) ?: '\u0000'
        private fun take(): Char = input[position++]
    }
}
