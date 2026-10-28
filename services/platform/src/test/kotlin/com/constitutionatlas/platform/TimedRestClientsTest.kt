package com.constitutionatlas.platform

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test
import org.springframework.http.HttpMethod
import org.springframework.http.MediaType
import org.springframework.test.web.client.MockRestServiceServer
import org.springframework.test.web.client.match.MockRestRequestMatchers.content
import org.springframework.test.web.client.match.MockRestRequestMatchers.method
import org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo
import org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess
import java.time.LocalDate

class TimedRestClientsTest {
    @Test
    fun `service client keeps Spring 6 JSON order dates and primitive null defaults`() {
        val builder = timedRestClientBuilder("https://service.example")
        val server = MockRestServiceServer.bindTo(builder).build()
        server.expect(requestTo("https://service.example/wire"))
            .andExpect(method(HttpMethod.POST))
            .andExpect(content().string("""{"label":"sample","effectiveDate":[1949,5,23],"enabled":false}"""))
            .andRespond(withSuccess("""{"label":"response","effectiveDate":"1949-05-23","enabled":null,"extra":"ignored"}""", MediaType.APPLICATION_JSON))
        val response = builder.build().post().uri("/wire")
            .body(Wire("sample", LocalDate.parse("1949-05-23")))
            .retrieve().body(Wire::class.java)
        assertEquals(Wire("response", LocalDate.parse("1949-05-23")), response)
        server.verify()
    }

    data class Wire(val label: String, val effectiveDate: LocalDate, val enabled: Boolean = false)
}
