package com.constitutionatlas.platform

import com.fasterxml.jackson.core.StreamReadConstraints
import com.fasterxml.jackson.databind.ObjectMapper
import org.springframework.beans.factory.config.BeanPostProcessor

/**
 * Opt-in limits for services accepting structured content. Import this configuration
 * explicitly; multipart uploads keep their separate streaming and size constraints.
 */
class JsonReadLimits : BeanPostProcessor {
    override fun postProcessAfterInitialization(bean: Any, beanName: String): Any {
        if (bean is ObjectMapper) {
            bean.factory.setStreamReadConstraints(CONSTRAINTS)
        }
        return bean
    }

    companion object {
        private val CONSTRAINTS: StreamReadConstraints =
            StreamReadConstraints.builder()
                .maxNestingDepth(32)
                .maxDocumentLength(2_097_152)
                .maxStringLength(1_048_576)
                .maxNameLength(256)
                .build()
    }
}
