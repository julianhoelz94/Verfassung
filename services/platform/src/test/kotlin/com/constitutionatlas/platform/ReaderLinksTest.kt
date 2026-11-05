package com.constitutionatlas.platform

import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import java.util.UUID

class ReaderLinksTest {
    private val version = UUID.randomUUID()
    private val occurrence = UUID.randomUUID()
    private val jurisdiction = UUID.randomUUID()

    @Test
    fun `national links keep the exact snapshot and occurrence without an alias`() {
        assertThat(readerPassageHref("DE", jurisdiction, version, occurrence))
            .isEqualTo("/countries/DE/versions/$version#$occurrence")
    }

    @Test
    fun `regional and historical links use the jurisdiction owner`() {
        assertThat(readerPassageHref(null, jurisdiction, version, occurrence))
            .isEqualTo("/jurisdictions/$jurisdiction/versions/$version#$occurrence")
    }

    @Test
    fun `unknown owners do not generate a broken or caller controlled destination`() {
        assertThat(readerPassageHref(null, null, version, occurrence)).isNull()
        assertThat(readerPassageHref("//external.example", null, version, occurrence)).isNull()
    }
}
