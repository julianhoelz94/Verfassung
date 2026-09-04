package com.constitutionatlas.identity.config

import io.swagger.v3.oas.models.Components
import io.swagger.v3.oas.models.OpenAPI
import io.swagger.v3.oas.models.info.Info
import io.swagger.v3.oas.models.security.SecurityScheme
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration

@Configuration
class OpenApiConfig {
    @Bean
    fun identityOpenApi(): OpenAPI =
        OpenAPI()
            .info(
                Info()
                    .title("Identity API")
                    .version("1")
                    .description("Login, session inspection, and logout with opaque Bearer tokens."),
            )
            .components(
                Components().addSecuritySchemes(
                    "bearer-session",
                    SecurityScheme()
                        .type(SecurityScheme.Type.HTTP)
                        .scheme("bearer")
                        .bearerFormat("opaque")
                        .description("Session token returned by POST /login"),
                ),
            )
}
