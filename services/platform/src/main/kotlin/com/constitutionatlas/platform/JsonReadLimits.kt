package com.constitutionatlas.platform

import org.springframework.boot.jackson.autoconfigure.JsonFactoryBuilderCustomizer
import tools.jackson.core.StreamReadConstraints
import tools.jackson.core.json.JsonFactoryBuilder

/**
 * Opt-in limits for services accepting structured content. Import this configuration
 * explicitly; multipart uploads keep their separate streaming and size constraints.
 */
class JsonReadLimits : JsonFactoryBuilderCustomizer {
    override fun customize(jsonFactoryBuilder: JsonFactoryBuilder) {
        jsonFactoryBuilder.streamReadConstraints(CONSTRAINTS)
    }

    companion object {
        val CONSTRAINTS: StreamReadConstraints =
            StreamReadConstraints.builder()
                .maxNestingDepth(32)
                .maxDocumentLength(2_097_152)
                .maxStringLength(1_048_576)
                .maxNameLength(256)
                .build()
    }
}
