package com.constitutionatlas.platform

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Test
import org.springframework.boot.autoconfigure.AutoConfigurations
import org.springframework.boot.jackson.autoconfigure.JacksonAutoConfiguration
import org.springframework.boot.test.context.runner.ApplicationContextRunner
import tools.jackson.core.exc.StreamConstraintsException
import tools.jackson.databind.json.JsonMapper
import java.time.Instant
import java.time.LocalDate
import java.util.UUID

class JsonCompatibilityTest {
    private val context = ApplicationContextRunner()
        .withConfiguration(AutoConfigurations.of(JacksonAutoConfiguration::class.java))
        .withPropertyValues("spring.jackson.use-jackson2-defaults=true")
        .withBean(JsonReadLimits::class.java)

    @Test
    fun `boot mapper preserves structured input limits`() {
        context.run { application ->
            val mapper = application.getBean(JsonMapper::class.java)
            val constraints = mapper.tokenStreamFactory().streamReadConstraints()
            assertEquals(32, constraints.maxNestingDepth)
            assertEquals(2_097_152L, constraints.maxDocumentLength)
            assertEquals(1_048_576, constraints.maxStringLength)
            assertEquals(256, constraints.maxNameLength)
            assertEquals("ok", mapper.readTree("""{"text":"ok"}""").path("text").asString())
            assertThrows(StreamConstraintsException::class.java) {
                mapper.readTree("[".repeat(33) + "0" + "]".repeat(33))
            }
            assertThrows(StreamConstraintsException::class.java) {
                mapper.readTree("{\"" + "x".repeat(257) + "\":0}")
            }
            assertThrows(StreamConstraintsException::class.java) {
                mapper.readTree("\"" + "x".repeat(1_048_577) + "\"")
            }
            assertThrows(StreamConstraintsException::class.java) {
                mapper.readTree(("[" + "0,".repeat(1_050_000) + "0]").toByteArray())
            }
        }
    }

    @Test
    fun `boot JSON retains date UUID and Kotlin defaults in API payloads`() {
        context.run { application ->
            val mapper = application.getBean(JsonMapper::class.java)
            val id = UUID.fromString("00000000-0000-0000-0000-000000000001")
            val value = Wire(id, LocalDate.parse("1949-05-23"), Instant.parse("2026-10-26T20:00:00Z"))
            val json = mapper.readTree(mapper.writeValueAsBytes(value))
            assertEquals(id.toString(), json.path("id").asString())
            assertEquals("1949-05-23", json.path("date").asString())
            assertEquals("2026-10-26T20:00:00Z", json.path("recordedAt").asString())
            assertEquals(value, mapper.readValue(mapper.writeValueAsBytes(value), Wire::class.java))
            assertEquals(DefaultWire(), mapper.readValue("{}", DefaultWire::class.java))
            assertEquals(DefaultWire(), mapper.readValue("""{"enabled":null,"label":null}""", DefaultWire::class.java))
            assertEquals("""{"enabled":false,"label":null,"values":[]}""", mapper.writeValueAsString(DefaultWire()))
            assertEquals(
                """{"id":"00000000-0000-0000-0000-000000000001","date":"1949-05-23","recordedAt":"2026-10-26T20:00:00Z"}""",
                mapper.writeValueAsString(value),
            )
        }
    }

    @Test
    fun `tree scalar extraction keeps malformed containers out of string contracts`() {
        val mapper = JsonMapper()
        assertEquals("", mapper.readTree("{}").scalarText())
        assertEquals("", mapper.readTree("[]").scalarText())
        assertEquals("", mapper.readTree("{}").path("missing").scalarText())
        assertEquals("null", mapper.readTree("null").scalarText())
        assertEquals("12", mapper.readTree("12").scalarText())
        assertEquals("true", mapper.readTree("true").scalarText())
        assertEquals("text", mapper.readTree("\"text\"").scalarText())
    }

    data class Wire(val id: UUID, val date: LocalDate, val recordedAt: Instant)
    data class DefaultWire(val enabled: Boolean = false, val label: String? = null, val values: List<String> = emptyList())
}
