package com.constitutionatlas.audit.config

import org.flywaydb.core.api.callback.Callback
import org.flywaydb.core.api.callback.Context
import org.flywaydb.core.api.callback.Event
import org.springframework.beans.factory.annotation.Value
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration

@Configuration
class AuditRuntimeRole {
    @Bean
    fun auditRuntimeRoleCallback(
        @Value("\${AUDIT_RUNTIME_PASSWORD:}") password: String,
        @Value("\${spring.datasource.username:}") username: String,
    ): Callback {
        require(username != "audit_runtime" || password.isNotBlank()) { "AUDIT_RUNTIME_PASSWORD is required for the audit runtime role" }
        return object : Callback {
            override fun supports(event: Event, context: Context?): Boolean = event == Event.BEFORE_MIGRATE && password.isNotBlank()
            override fun canHandleInTransaction(event: Event, context: Context?): Boolean = true
            override fun getCallbackName(): String = "configure-audit-runtime-role"
            override fun handle(event: Event, context: Context?) {
                val connection = requireNotNull(context).connection
                connection.createStatement().use { statement ->
                    statement.execute("DO $$ BEGIN IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'audit_runtime') THEN CREATE ROLE audit_runtime NOLOGIN; END IF; END $$")
                }
                // Let PostgreSQL quote the secret; never interpolate unescaped input
                // into SQL or put a changing password in a versioned migration.
                val quoted = connection.prepareStatement("SELECT quote_literal(?)").use { statement ->
                    statement.setString(1, password)
                    statement.executeQuery().use { result ->
                        result.next()
                        result.getString(1)
                    }
                }
                connection.createStatement().use { statement ->
                    statement.execute("ALTER ROLE audit_runtime LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS PASSWORD $quoted")
                }
            }
        }
    }
}
