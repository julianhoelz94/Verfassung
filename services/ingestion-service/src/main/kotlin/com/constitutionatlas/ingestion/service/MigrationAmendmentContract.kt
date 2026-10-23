package com.constitutionatlas.ingestion.service

import com.fasterxml.jackson.databind.JsonNode

/** Keep the migration write surface exact without changing the established native revision API. */
internal fun validateMigrationAmendment(payload: JsonNode) {
    fun fields(value: JsonNode, allowed: Set<String>, path: String) {
        require(value.isObject) { "$path must be an object" }
        val unknown = value.fieldNames().asSequence().filter { it !in allowed }.toList()
        require(unknown.isEmpty()) { "$path contains unsupported fields: ${unknown.joinToString()}" }
    }
    fields(payload, setOf("constitutionId", "record"), "amendment")
    val record = payload.path("record")
    fields(record, setOf("title", "comment", "documents", "enactedOn", "effectiveOn", "sourceVersionId", "targetVersionId", "changes"), "amendment.record")
    record.path("documents").takeUnless { it.isMissingNode || it.isNull }?.let { documents ->
        require(documents.isArray) { "amendment.record.documents must be an array" }
        documents.forEachIndexed { index, document -> fields(document, setOf("url", "fileId", "label"), "amendment.record.documents[$index]") }
    }
    record.path("changes").takeUnless { it.isMissingNode || it.isNull }?.let { changes ->
        require(changes.isArray) { "amendment.record.changes must be an array" }
        changes.forEachIndexed { index, change ->
            val path = "amendment.record.changes[$index]"
            fields(change, setOf("articleNumber", "changeType", "note", "articleId", "nodeId", "changedOn", "effectiveOn", "amendingLawTitle", "amendingLawCitation", "beforeRef", "afterRef", "linkReviewReason", "pendingAfterLogicalId", "id", "sourceChangeId"), path)
            for (key in listOf("beforeRef", "afterRef")) {
                change.path(key).takeUnless { it.isMissingNode || it.isNull }?.let { ref ->
                    fields(ref, setOf("versionId", "logicalId", "occurrenceId", "revisionId", "unitKind"), "$path.$key")
                }
            }
        }
    }
}
