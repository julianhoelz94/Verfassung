package com.constitutionatlas.editor.service

import com.constitutionatlas.editor.api.DraftNode
import com.constitutionatlas.editor.api.DraftOperation
import com.constitutionatlas.editor.client.DraftSettings

/** Applies pinned structured operations without altering exact authored text or final validation order. */
object StructuredDraftEngine {
    /** Final outline/rich checks run once, after all operations, allowing intermediate incomplete states. */
    fun replay(source: List<DraftNode>, operations: List<DraftOperation>, settings: DraftSettings, enforceEndnotes: Boolean = true): List<DraftNode> {
        var roots = source
        operations.forEach { operation -> roots = DraftReplayStep(roots, operation).replay() }
        validate(roots, settings, enforceEndnotes)
        return roots
    }

    /** Readiness/publication checks require complete marker coverage independently of ordinary replay. */
    fun requireFootnoteMarkers(roots: List<DraftNode>) = DraftReplayValidation.requireFootnoteMarkers(roots)

    /** Historical previews can relax endnote ordering and unit-target resolution with [enforceEndnotes]. */
    fun validate(roots: List<DraftNode>, settings: DraftSettings, enforceEndnotes: Boolean = true) = DraftReplayValidation.validate(roots, settings, enforceEndnotes)
}
