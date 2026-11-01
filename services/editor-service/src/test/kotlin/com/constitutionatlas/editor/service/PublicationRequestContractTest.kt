package com.constitutionatlas.editor.service

import com.constitutionatlas.editor.ConflictException
import com.constitutionatlas.editor.api.ChangeRecordChange
import com.constitutionatlas.editor.api.ChangeRecordDocument
import com.constitutionatlas.editor.api.ChangeRecordRequest
import com.constitutionatlas.editor.api.ChangeRecordUnitRef
import com.constitutionatlas.editor.api.EditSessionDto
import com.constitutionatlas.editor.api.EditSessionStatus
import com.constitutionatlas.editor.api.PublishRequest
import com.constitutionatlas.editor.api.SourceEvidenceRevisionDto
import com.constitutionatlas.editor.repo.EditorRepository
import com.constitutionatlas.editor.repo.SourceEvidenceRepository
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import org.mockito.Mockito.mock
import org.mockito.Mockito.verifyNoInteractions
import org.mockito.Mockito.`when`
import tools.jackson.module.kotlin.jacksonObjectMapper
import java.util.UUID

class PublicationRequestContractTest {
    private val repository = mock(EditorRepository::class.java)
    private val evidence = mock(SourceEvidenceRepository::class.java)
    private val requests = EditorPublicationRequest(repository, evidence)
    private val session = EditSessionDto(UUID.randomUUID(), UUID.randomUUID(), UUID.randomUUID(), EditSessionStatus.APPROVED, 1, "legal")

    @Test
    fun `session job mismatch precedes saved metadata and content validation`() {
        val error = assertThrows(IllegalArgumentException::class.java) { requests.resolve(session, PublishRequest("editorial_correction"), true) }
        assertEquals("publish hopKind must match the session job", error.message)
        verifyNoInteractions(repository, evidence)
    }

    @Test
    fun `normalized correction job preserves the reviewed comment exactly`() {
        `when`(repository.publishComment(session.id)).thenReturn("  Reviewed wording  ")
        val details = requests.resolve(session.copy(hopKind = "editorial_correction"), PublishRequest(" EDITORIAL_CORRECTION "), false)
        assertEquals("editorial_correction", details.hopKind)
        assertEquals("  Reviewed wording  ", details.comment)
        assertNull(details.changeRecord)
    }

    @Test
    fun `correction rejects a change record before reporting its missing comment`() {
        val error = assertThrows(IllegalArgumentException::class.java) {
            requests.resolve(session.copy(hopKind = "editorial_correction"), PublishRequest("editorial_correction", amendmentId = UUID.randomUUID()), false)
        }
        assertEquals("editorial_correction must not include a change record", error.message)
    }

    @Test
    fun `legal publication requires exactly one payload or existing amendment`() {
        val ambiguous = listOf(PublishRequest("legal"), PublishRequest("legal", amendmentId = UUID.randomUUID(), changeRecord = record()))
        for (request in ambiguous) {
            val error = assertThrows(IllegalArgumentException::class.java) { requests.resolve(session, request, false) }
            assertEquals("legal publish requires one change record payload or amendmentId", error.message)
        }
    }

    @Test
    fun `explicit existing amendment does not inherit the saved change record payload`() {
        `when`(repository.changeRecord(session.id)).thenReturn(record())
        val details = requests.resolve(session, PublishRequest("legal", amendmentId = UUID.randomUUID()), false)
        assertNull(details.changeRecord)
    }

    @Test
    fun `structured unreviewed payload is rejected before generic record metadata`() {
        `when`(repository.changeRecord(session.id)).thenReturn(record())
        val error = assertThrows(ConflictException::class.java) {
            requests.resolve(session, PublishRequest("legal", changeRecord = record().copy(title = "")), true)
        }
        assertEquals("stale_diff_review", error.code)
    }

    @Test
    fun `source evidence requires the exact saved publication reason`() {
        `when`(evidence.latest(session.id)).thenReturn(mock(SourceEvidenceRevisionDto::class.java))
        `when`(repository.publishComment(session.id)).thenReturn("Reviewed reason")
        val error = assertThrows(ConflictException::class.java) {
            requests.resolve(session, PublishRequest("legal", comment = "Unreviewed reason", amendmentId = UUID.randomUUID()), true)
        }
        assertEquals("stale_source_evidence", error.code)
    }

    @Test
    fun `legacy legal records may leave change rows empty for article projection`() {
        `when`(repository.changeRecord(session.id)).thenReturn(record())
        assertTrue(requests.resolve(session, PublishRequest("legal"), false).changeRecord!!.changes.isEmpty())
    }

    @Test
    fun `structured legal records cannot omit unit selection rows`() {
        `when`(repository.changeRecord(session.id)).thenReturn(record())
        val error = assertThrows(IllegalArgumentException::class.java) { requests.resolve(session, PublishRequest("legal"), true) }
        assertEquals("Structured legal publish needs exact before/after unit selections", error.message)
    }

    @Test
    fun `structured legal rows accept added removed and changed exact sides`() {
        val before = ChangeRecordUnitRef(UUID.randomUUID())
        val pending = UUID.randomUUID()
        val changes = listOf(
            change("added").copy(pendingAfterLogicalId = pending),
            change("removed").copy(beforeRef = before),
            change("changed").copy(beforeRef = before, pendingAfterLogicalId = pending),
            change("changed").copy(beforeRef = before, afterRef = ChangeRecordUnitRef(UUID.randomUUID())),
        )
        val reviewed = record(changes)
        `when`(repository.changeRecord(session.id)).thenReturn(reviewed)
        assertEquals(reviewed, requests.resolve(session, PublishRequest("legal"), true).changeRecord)
    }

    @Test
    fun `invalid structured selection sides retain their precise public rejection`() {
        val before = ChangeRecordUnitRef(UUID.randomUUID())
        val after = ChangeRecordUnitRef(UUID.randomUUID())
        val invalid = listOf(change("added"), change("added").copy(beforeRef = before, afterRef = after), change("removed"), change("removed").copy(beforeRef = before, pendingAfterLogicalId = UUID.randomUUID()), change("changed").copy(beforeRef = before), change("unknown"))
        for (row in invalid) {
            `when`(repository.changeRecord(session.id)).thenReturn(record(listOf(row)))
            val error = assertThrows(IllegalArgumentException::class.java) { requests.resolve(session, PublishRequest("legal"), true) }
            assertEquals("Structured legal publish needs exact unit selections for every change", error.message)
        }
    }

    @Test
    fun `mixed content detection preserves nested child and parent text`() {
        val mapper = jacksonObjectMapper()
        val mixed = mapper.readTree("""[{"type":"child","node":{"content":[{"type":"text"},{"type":"child"}]}}]""")
        assertTrue(EditorPublicationRules.mixedContent(mixed))
        assertEquals(false, EditorPublicationRules.mixedContent(mapper.readTree("""[{"type":"text"}]""")))
        assertEquals(false, EditorPublicationRules.mixedContent(null))
    }

    /** A valid document-backed change record isolates the contract exercised by each case. */
    private fun record(changes: List<ChangeRecordChange> = emptyList()) = ChangeRecordRequest("Act", "Reviewed description", listOf(ChangeRecordDocument(url = "https://example.org/source")), changes)

    /** Rows start with no unit selection so each scenario explicitly supplies its valid/invalid sides. */
    private fun change(type: String) = ChangeRecordChange(UUID.randomUUID(), "1", changeType = type)
}
