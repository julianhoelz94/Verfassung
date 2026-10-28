package com.constitutionatlas.ingestion.service

import com.constitutionatlas.platform.JsonReadLimits
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Test
import tools.jackson.core.exc.StreamConstraintsException
import tools.jackson.core.json.JsonFactory
import tools.jackson.databind.DeserializationFeature
import tools.jackson.databind.exc.UnrecognizedPropertyException
import tools.jackson.databind.json.JsonMapper
import tools.jackson.module.kotlin.kotlinModule

class ImportUploadJsonTest {
    private val factory = JsonFactory.builder().also { JsonReadLimits().customize(it) }.build()
    private val mapper = JsonMapper.builder(factory).addModule(kotlinModule())
        .enable(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES).build()

    @Test
    fun `resumable upload reads larger documents without relaxing normal requests`() {
        val reader = importUploadReader(mapper)
        val document = ("[" + List(3) { "\"" + "x".repeat(750_000) + "\"" }.joinToString(",") + "]").toByteArray()
        assertEquals(3, reader.readTree(document).size())
        assertThrows(StreamConstraintsException::class.java) { mapper.readTree(document) }
        assertThrows(StreamConstraintsException::class.java) { reader.readTree("[".repeat(33) + "0" + "]".repeat(33)) }
        assertThrows(StreamConstraintsException::class.java) { reader.readTree("\"" + "x".repeat(1_048_577) + "\"") }
        assertEquals(2_097_152L, mapper.tokenStreamFactory().streamReadConstraints().maxDocumentLength)
    }

    @Test
    fun `upload reader retains Kotlin modules and application deserialization policy`() {
        val reader = importUploadReader(mapper).forType(Payload::class.java)
        assertEquals(Payload("value"), reader.readValue<Payload>("""{"name":"value"}"""))
        assertThrows(UnrecognizedPropertyException::class.java) {
            reader.readValue<Payload>("""{"name":"value","unknown":true}""")
        }
    }

    data class Payload(val name: String, val labels: List<String> = emptyList())
}
