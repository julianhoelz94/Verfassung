package com.constitutionatlas.platform

import org.springframework.http.client.JdkClientHttpRequestFactory
import org.springframework.web.client.RestClient
import java.net.http.HttpClient
import java.time.Duration

/** Shared service-to-service timeouts. Callers add authentication on their own builder. */
fun timedRestClient(baseUrl: String): RestClient = timedRestClientBuilder(baseUrl).build()

/** Returns a fresh builder so interceptors and headers never leak between clients. */
fun timedRestClientBuilder(baseUrl: String, readTimeout: Duration = READ_TIMEOUT): RestClient.Builder {
    val factory = JdkClientHttpRequestFactory(HttpClient.newBuilder().connectTimeout(CONNECT_TIMEOUT).build())
    factory.setReadTimeout(readTimeout)
    return RestClient.builder().baseUrl(baseUrl).requestFactory(factory)
}

private val CONNECT_TIMEOUT: Duration = Duration.ofSeconds(2)
private val READ_TIMEOUT: Duration = Duration.ofSeconds(5)
