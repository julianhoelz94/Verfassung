package com.constitutionatlas.editor

import org.springframework.boot.autoconfigure.SpringBootApplication
import org.springframework.boot.runApplication
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController

@SpringBootApplication
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
