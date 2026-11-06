package com.constitutionatlas.document.service

import com.constitutionatlas.document.api.CreatorDto
import java.text.Normalizer

internal object BibtexText {
    private val accents = mapOf('"' to '\u0308', '\'' to '\u0301', '`' to '\u0300', '^' to '\u0302', '~' to '\u0303', '=' to '\u0304', '.' to '\u0307', 'c' to '\u0327', 'v' to '\u030C', 'u' to '\u0306', 'H' to '\u030B', 'r' to '\u030A')
    private val symbols = mapOf("ss" to "ß", "ae" to "æ", "AE" to "Æ", "oe" to "œ", "OE" to "Œ", "aa" to "å", "AA" to "Å", "o" to "ø", "O" to "Ø", "l" to "ł", "L" to "Ł", "i" to "ı", "j" to "ȷ", "textbackslash" to "\\", "textasciitilde" to "~", "textasciicircum" to "^")

    fun text(raw: String): String {
        val result = StringBuilder()
        var index = 0
        while (index < raw.length) {
            val c = raw[index++]
            if (c == '{' || c == '}') continue
            if (c != '\\' || index == raw.length) {
                result.append(c)
                continue
            }
            val start = index
            index = commandEnd(raw, index)
            val command = raw.substring(start, index)
            val accented = accent(raw, command, index)
            if (accented != null) {
                result.append(accented.first)
                index = accented.second
            } else {
                result.append(symbol(command))
            }
        }
        return result.toString().replace(Regex("\\s+"), " ").trim()
    }

    private fun commandEnd(raw: String, start: Int): Int {
        if (!raw[start].isLetter()) return start + 1
        var end = start
        while (end < raw.length && raw[end].isLetter()) end++
        return end
    }

    private fun accent(raw: String, command: String, start: Int): Pair<String, Int>? {
        if (command.length != 1 || command[0] !in accents) return null
        var argument = start
        while (argument < raw.length && raw[argument].isWhitespace()) argument++
        val braced = raw.getOrNull(argument) == '{'
        if (braced) argument++
        val base = raw.getOrNull(argument) ?: return null
        if (!base.isLetter() || braced && raw.getOrNull(argument + 1) != '}') return null
        return Normalizer.normalize(base.toString() + accents.getValue(command[0]), Normalizer.Form.NFC) to
            (argument + if (braced) 2 else 1)
    }

    private fun symbol(command: String): String = when {
        command in symbols -> symbols.getValue(command)
        command in setOf("url", "textit", "textbf", "emph", "textrm") -> ""
        command.length == 1 && command[0] in "&%$#_{}\\" -> command
        else -> "\\$command"
    }

    fun names(raw: String?): List<CreatorDto> = raw?.takeIf(String::isNotBlank)?.let {
        split(it, and = true).map { name ->
            val trimmed = name.trim()
            if (trimmed.startsWith('{') && trimmed.endsWith('}') && balanced(trimmed.substring(1, trimmed.length - 1))) {
                CreatorDto(literal = text(trimmed.substring(1, trimmed.length - 1)))
            } else {
                val parts = split(trimmed, and = false)
                when {
                    parts.size > 2 -> CreatorDto(literal = text(trimmed))
                    parts.size == 2 -> CreatorDto(family = text(parts[0]), given = text(parts[1]).takeIf(String::isNotBlank))
                    else -> {
                        val words = trimmed.split(Regex("\\s+"))
                        val familyStart = words.indexOfFirst { it.firstOrNull()?.isLowerCase() == true }.takeIf { it >= 0 } ?: words.lastIndex
                        CreatorDto(family = text(words.drop(familyStart).joinToString(" ")), given = text(words.take(familyStart).joinToString(" ")).takeIf(String::isNotBlank))
                    }
                }
            }
        }
    } ?: emptyList()

    private fun split(value: String, and: Boolean): List<String> {
        val result = mutableListOf<String>()
        var depth = 0
        var start = 0
        var index = 0
        while (index < value.length) {
            when (value[index]) {
                '\\' -> index++
                '{' -> depth++
                '}' -> depth--
                ',' -> if (!and && depth == 0) {
                    result.add(value.substring(start, index))
                    start = index + 1
                }
                else -> if (and && depth == 0 && value.regionMatches(index, "and", 0, 3, ignoreCase = true) && value.getOrNull(index - 1)?.isWhitespace() == true && value.getOrNull(index + 3)?.isWhitespace() == true) {
                    result.add(value.substring(start, index).trim())
                    index += 2
                    start = index + 1
                }
            }
            index++
        }
        result.add(value.substring(start))
        return result
    }

    fun formatNames(creators: List<CreatorDto>): String = creators.joinToString(" and ") { creator ->
        creator.literal?.let { "{$it}" } ?: listOfNotNull(creator.family, creator.given?.takeIf(String::isNotBlank)).joinToString(", ")
    }

    fun balanced(value: String): Boolean {
        var depth = 0
        var escaped = false
        value.forEach { c ->
            if (escaped) {
                escaped = false
            } else if (c == '\\') {
                escaped = true
            } else if (c == '{') {
                depth++
            } else if (c == '}') {
                depth--
                if (depth < 0) return false
            }
        }
        return depth == 0 && !escaped
    }
}
