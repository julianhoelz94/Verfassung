package com.constitutionatlas.platform

import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Test
import tools.jackson.module.kotlin.jacksonObjectMapper

class SourceEvidenceTest {
    @Test
    fun freeDescriptionsRoundTripAndKeepLegacyJsonCompatible() {
        val mapper = jacksonObjectMapper()
        val evidence = SourceEvidence(description = "# Archive\n\n- [Source](https://example.org)\n\nFree text")
        evidence.validate()
        assertThat(mapper.readValue(mapper.writeValueAsString(evidence), SourceEvidence::class.java)).isEqualTo(evidence)
        assertThat(mapper.writeValueAsString(SourceEvidence(attribution = "Legacy"))).doesNotContain("description")
        assertThrows(IllegalArgumentException::class.java) { evidence.copy(description = "x".repeat(50001)).validate() }
    }
}
