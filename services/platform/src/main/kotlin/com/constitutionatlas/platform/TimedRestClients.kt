package com.constitutionatlas.platform

import org.springframework.http.client.JdkClientHttpRequestFactory
import org.springframework.http.converter.json.JacksonJsonHttpMessageConverter
import org.springframework.web.client.RestClient
import tools.jackson.databind.DeserializationFeature
import tools.jackson.databind.MapperFeature
import tools.jackson.databind.json.JsonMapper
import java.net.http.HttpClient
import java.time.Duration

/** Shared service-to-service timeouts. Callers add authentication on their own builder. */
fun timedRestClient(baseUrl: String): RestClient = timedRestClientBuilder(baseUrl).build()

/** Returns a fresh builder so interceptors and headers never leak between clients. */
fun timedRestClientBuilder(baseUrl: String, readTimeout: Duration = READ_TIMEOUT): RestClient.Builder {
    val factory = JdkClientHttpRequestFactory(HttpClient.newBuilder().connectTimeout(CONNECT_TIMEOUT).build())
    factory.setReadTimeout(readTimeout)
    return RestClient.builder().baseUrl(baseUrl).requestFactory(factory)
        .messageConverters { converters ->
            // This builder is outside Boot auto-configuration; preserve Spring 6's wire defaults here too.
            val mapper = JsonMapper.builder().configureForJackson2()
                .disable(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES)
                .disable(MapperFeature.DEFAULT_VIEW_INCLUSION)
                .findAndAddModules()
                .build()
            val index = converters.indexOfFirst { it is JacksonJsonHttpMessageConverter }
            check(index >= 0) { "JSON message converter is required" }
            converters[index] = JacksonJsonHttpMessageConverter(mapper)
        }
}

private val CONNECT_TIMEOUT: Duration = Duration.ofSeconds(2)
private val READ_TIMEOUT: Duration = Duration.ofSeconds(5)
