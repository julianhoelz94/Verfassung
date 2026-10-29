package com.constitutionatlas.ingestion.service

import com.constitutionatlas.ingestion.api.ImportOutline
import com.constitutionatlas.ingestion.api.ImportOutlineKind
import com.constitutionatlas.ingestion.api.ImportRequest
import com.constitutionatlas.platform.Actor
import com.constitutionatlas.platform.OrderedNodeWrite
import com.constitutionatlas.platform.OrderedValidationError
import org.springframework.http.HttpStatus
import org.springframework.web.server.ResponseStatusException

/** Stateless entry points for staged import validation and retry-safe rich-content rechecks. */
object ImportValidator {
    /** Scoped upload tokens require confirmed settings unless their actor also has an editorial role. */
    fun requireConfirmedPinForScopedUpload(actor: Actor, request: ImportRequest) {
        if ("ingestion:import" in actor.scopes && actor.roles.none { it == "editor" || it == "admin" }) {
            if (request.constitutionId == null || request.settingsRevisionId == null || request.outline != null) {
                throw ResponseStatusException(HttpStatus.CONFLICT, "Full upload requires a confirmed constitutionId and settingsRevisionId; omit outline")
            }
        }
    }

    /**
     * Accumulates metadata, ordered-content and legacy diagnostics without short-circuiting.
     * A non-null pinned outline overrides the submitted outline, including when it is empty.
     * Codes, messages and encounter order are preserved for staged upload feedback.
     */
    fun validate(request: ImportRequest, pinnedOutline: ImportOutline? = null): List<Pair<String, String>> = buildList {
        val outline = ImportOutlineValidation((pinnedOutline ?: request.outline)?.kinds.orEmpty())
        addAll(ImportMetadataValidation.errors(request))
        if (request.roots.isNotEmpty()) {
            addAll(OrderedImportValidation(outline, request.predecessorVersionId).validate(request.roots))
            addAll(richContentErrors(request.roots))
        }
        addAll(LegacyImportValidation.errors(request.articles, outline))
    }

    /** Returns normalized selected-outline codes, defaulting to article when no usable code exists. */
    fun allowedKinds(request: ImportRequest, pinnedOutline: ImportOutline? = null): Set<String> =
        ImportOutlineValidation((pinnedOutline ?: request.outline)?.kinds.orEmpty()).allowedKinds

    /** Validates automatic sentence settings independently for setup and outline confirmation. */
    fun outlineSentenceErrors(kinds: List<ImportOutlineKind>): List<Pair<String, String>> = ImportOutlineValidation(kinds).sentenceErrors()

    /** Re-run on retries and preparation as older staged items may predate a new invariant. */
    fun richContentErrors(roots: List<OrderedNodeWrite>): List<Pair<String, String>> = richContentValidationErrors(roots).map { it.code to it.message }

    /** Retains structured paths and logical identities for complete-document preparation errors. */
    fun richContentValidationErrors(roots: List<OrderedNodeWrite>): List<OrderedValidationError> = ImportRichContentValidation.documentErrors(roots)
}
