package com.constitutionatlas.editor

import com.constitutionatlas.editor.config.EditorPublishProperties
import org.springframework.boot.autoconfigure.SpringBootApplication
import org.springframework.boot.context.properties.EnableConfigurationProperties
import org.springframework.boot.runApplication
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController

@SpringBootApplication
@EnableConfigurationProperties(EditorPublishProperties::class)
class EditorServiceApplication

fun main(args: Array<String>) {
    runApplication<EditorServiceApplication>(*args)
}

@RestController
@RequestMapping("/internal")
class InternalController {
    @GetMapping("/ping")
    fun ping(): Map<String, String> = mapOf("service" to "editor-service", "status" to "ok")
}
