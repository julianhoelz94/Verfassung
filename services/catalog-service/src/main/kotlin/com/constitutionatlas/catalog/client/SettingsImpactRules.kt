package com.constitutionatlas.catalog.client

import com.constitutionatlas.catalog.api.OutlineKindWrite
import com.constitutionatlas.catalog.api.SettingsViolation
import com.constitutionatlas.platform.scalarText
import tools.jackson.databind.JsonNode
import java.util.UUID

/** One version's ordered structural-policy check, independent of HTTP and draft-session discovery. */
internal class SettingsImpactRules(private val version: UUID, proposed: List<OutlineKindWrite>) {
    private val byCode = proposed.associateBy { it.kindCode }
    private val violations = mutableListOf<SettingsViolation>()

    /** Invalid kinds prune their subtree; valid nodes report title, label and stored entries in order. */
    fun inspect(snapshot: JsonNode): List<SettingsViolation> {
        snapshot.path("roots").forEach { walk(it, null) }
        return violations
    }

    /** Identity parsing precedes kind rejection, preserving malformed-UUID failures. */
    private fun walk(node: JsonNode, parent: OutlineKindWrite?) {
        val logical = node.path("logicalId").scalarText().takeIf { it.isNotEmpty() }?.let(UUID::fromString)
        val code = node.path("kind").scalarText()
        val level = byCode[code]
        if (level == null || (parent == null && level.root != true) || (parent != null && code !in parent.allowedChildKinds.orEmpty())) {
            violation(logical, "kind", "Stored '$code' is not allowed ${if (parent == null) "at the root" else "under '${parent.kindCode}'"}")
            return
        }
        val title = node.path("title").takeUnless { it.isNull }?.scalarText().orEmpty()
        val label = node.path("label").takeUnless { it.isNull }?.scalarText().orEmpty()
        if ((level.titlePolicy == "required" && title.isBlank()) || (level.titlePolicy == "none" && title.isNotEmpty())) violation(logical, "title", "Stored title violates the proposed authoring policy")
        if ((level.labelPolicy == "required" && label.isBlank()) || (level.labelPolicy == "none" && label.isNotEmpty())) violation(logical, "label", "Stored literal label violates the proposed policy")
        entries(node, level, logical)
    }

    /** Every non-child entry is parent text for impact purposes, matching the historical policy. */
    private fun entries(node: JsonNode, level: OutlineKindWrite, logical: UUID?) {
        node.path("content").forEach { entry ->
            if (entry.path("type").scalarText() == "child") {
                walk(entry.path("node"), level)
            } else if (level.allowedChildKinds.orEmpty().isNotEmpty() && !level.allowTextAlongsideChildren) {
                violation(logical, "content", "Stored parent text requires permission alongside children")
            }
        }
    }

    /** Feedback pins the version and optional stored logical identity without normalizing authored values. */
    private fun violation(logical: UUID?, field: String, message: String) {
        violations += SettingsViolation(version, logical, field, message)
    }
}
