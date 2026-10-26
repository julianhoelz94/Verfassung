package com.constitutionatlas.content

import com.constitutionatlas.platform.JsonReadLimits
import org.springframework.boot.autoconfigure.SpringBootApplication
import org.springframework.boot.runApplication
import org.springframework.context.annotation.Import
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController

@SpringBootApplication
@Import(JsonReadLimits::class)
class ContentServiceApplication

fun main(args: Array<String>) {
    runApplication<ContentServiceApplication>(*args)
}

@RestController
@RequestMapping("/internal")
class InternalController {
    @GetMapping("/ping")
    fun ping(): Map<String, String> = mapOf("service" to "content-service", "status" to "ok")
}
