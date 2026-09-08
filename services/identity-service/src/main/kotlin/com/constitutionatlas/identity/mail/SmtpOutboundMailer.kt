package com.constitutionatlas.identity.mail

import com.constitutionatlas.identity.config.IdentityMailProperties
import org.slf4j.LoggerFactory
import org.springframework.mail.javamail.JavaMailSenderImpl
import org.springframework.mail.javamail.MimeMessageHelper
import org.springframework.stereotype.Service
import java.nio.charset.StandardCharsets
import java.util.Properties

@Service
class SmtpOutboundMailer(
    private val properties: IdentityMailProperties,
) : OutboundMailer {
    private val log = LoggerFactory.getLogger(javaClass)

    override val enabled: Boolean
        get() = properties.configured()

    override fun sendPasswordReset(to: String, token: String) {
        val link = MailLinks.reset(properties.publicBaseUrl, token)
        send(
            to,
            "Reset your Constitution Atlas password",
            """
            A password reset was requested for this Constitution Atlas account.

            Open this link to choose a new password:
            $link

            If you did not request this, you can ignore this email.
            """.trimIndent(),
        )
    }

    override fun sendInvite(to: String, token: String) {
        val link = MailLinks.invite(properties.publicBaseUrl, token)
        send(
            to,
            "You're invited to Constitution Atlas",
            """
            You were invited to Constitution Atlas.

            Open this link to set your password and activate the account:
            $link

            If you were not expecting this, you can ignore this email.
            """.trimIndent(),
        )
    }

    private fun send(to: String, subject: String, body: String) {
        if (!enabled) {
            return
        }
        try {
            val sender = mailSender()
            val message = sender.createMimeMessage()
            val helper = MimeMessageHelper(message, StandardCharsets.UTF_8.name())
            if (properties.fromName.isBlank()) {
                helper.setFrom(properties.from)
            } else {
                helper.setFrom(properties.from, properties.fromName)
            }
            helper.setTo(to)
            helper.setSubject(subject)
            helper.setText(body, false)
            sender.send(message)
        } catch (ex: Exception) {
            log.error("Failed to send mail to {}: {}", to, ex.message)
        }
    }

    private fun mailSender(): JavaMailSenderImpl {
        val sender = JavaMailSenderImpl()
        sender.host = properties.host
        sender.port = properties.port
        if (properties.username.isNotBlank()) {
            sender.username = properties.username
            sender.password = properties.password
        }
        val props = Properties()
        props["mail.smtp.auth"] = properties.auth.toString()
        props["mail.smtp.starttls.enable"] = properties.startTls.toString()
        props["mail.smtp.ssl.enable"] = properties.ssl.toString()
        props["mail.smtp.connectiontimeout"] = "5000"
        props["mail.smtp.timeout"] = "5000"
        props["mail.smtp.writetimeout"] = "5000"
        sender.javaMailProperties = props
        return sender
    }
}
