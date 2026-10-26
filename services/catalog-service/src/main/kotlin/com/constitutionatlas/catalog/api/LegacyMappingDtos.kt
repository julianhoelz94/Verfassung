package com.constitutionatlas.catalog.api

import com.constitutionatlas.platform.StrictOrderedWrite
import java.util.UUID

data class LegacyMappingRequest(
    val sourceUrl: String,
    val kind: String,
    val versionId: UUID? = null,
    val logicalId: UUID? = null,
    val documentId: UUID? = null,
    val documentRevision: Int? = null,
) : StrictOrderedWrite()
data class LegacyMapping(val id: UUID, val sourceUrl: String, val target: LegacyMappingRequest)
data class LegacyResolution(val mappingId: UUID, val sourceUrl: String, val targetUrl: String)
