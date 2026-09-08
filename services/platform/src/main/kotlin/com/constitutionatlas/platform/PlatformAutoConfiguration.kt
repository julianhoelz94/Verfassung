package com.constitutionatlas.platform

import org.springframework.boot.autoconfigure.AutoConfiguration
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Import

@AutoConfiguration
@Import(IdentityClientConfig::class)
class PlatformAutoConfiguration {
    @Bean
    fun correlationIdFilter(): CorrelationIdFilter = CorrelationIdFilter()

    @Bean
    fun problemAdvice(): ProblemAdvice = ProblemAdvice()
}
