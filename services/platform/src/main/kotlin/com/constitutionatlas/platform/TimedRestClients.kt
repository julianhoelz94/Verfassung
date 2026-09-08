package com.constitutionatlas.platform

import org.springframework.http.client.JdkClientHttpRequestFactory
import org.springframework.web.client.RestClient
import java.net.http.HttpClient
import java.time.Duration

internal fun timedRestClient(baseUrl: String): RestClient {
    val factory = JdkClientHttpRequestFactory(HttpClient.newBuilder().connectTimeout(CONNECT_TIMEOUT).build())
    factory.setReadTimeout(READ_TIMEOUT)
    return RestClient.builder().baseUrl(baseUrl).requestFactory(factory).build()
}

private val CONNECT_TIMEOUT: Duration = Duration.ofSeconds(2)
private val READ_TIMEOUT: Duration = Duration.ofSeconds(5)
