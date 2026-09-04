package com.constitutionatlas.identity

import com.constitutionatlas.identity.config.IdentityLoginProperties
import com.constitutionatlas.identity.config.IdentitySeedProperties
import com.constitutionatlas.identity.config.IdentitySessionProperties
import org.springframework.boot.autoconfigure.SpringBootApplication
import org.springframework.boot.context.properties.EnableConfigurationProperties
import org.springframework.boot.runApplication
import org.springframework.scheduling.annotation.EnableScheduling
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController

@SpringBootApplication
@EnableScheduling
@EnableConfigurationProperties(
    IdentitySeedProperties::class,
    IdentitySessionProperties::class,
    IdentityLoginProperties::class,
)
class IdentityServiceApplication

fun main(args: Array<String>) {
    runApplication<IdentityServiceApplication>(*args)
}

@RestController
@RequestMapping("/internal")
class InternalController {
    @GetMapping("/ping")
    fun ping(): Map<String, String> = mapOf("service" to "identity-service", "status" to "ok")
}
