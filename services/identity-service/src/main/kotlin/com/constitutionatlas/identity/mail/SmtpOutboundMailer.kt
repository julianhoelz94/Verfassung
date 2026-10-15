package com.constitutionatlas.identity.mail

import com.constitutionatlas.identity.MailDeliveryException
import com.constitutionatlas.identity.config.IdentityMailProperties
import com.constitutionatlas.identity.service.IdentitySettingsService
import org.slf4j.LoggerFactory
import org.springframework.mail.javamail.JavaMailSenderImpl
import org.springframework.mail.javamail.MimeMessageHelper
import org.springframework.stereotype.Service
import java.nio.charset.StandardCharsets
import java.util.Properties

@Service
class SmtpOutboundMailer(
    private val settings: IdentitySettingsService,
) : OutboundMailer {
    private val log = LoggerFactory.getLogger(javaClass)
    private val properties: IdentityMailProperties
        get() = settings.currentMail()

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

    override fun sendRegistration(to: String, token: String) {
        val link = MailLinks.registration(properties.publicBaseUrl, token)
        val safeLink = link.replace("&", "&amp;").replace("\"", "&quot;").replace("<", "&lt;")
        send(
            to,
            "Confirm your Constitution Atlas account",
            """
            Confirm your email and choose your password using this link:
            $link

            After confirmation, you can add a passkey or scan the authenticator QR code in your Account page.
            Never share an authenticator key or recovery code. If you did not request this, ignore this email.
            """.trimIndent(),
            required = true,
            html = """<p>Confirm your email and choose your password:</p><p><a href="$safeLink" style="display:inline-block;padding:12px 18px;background:#164b71;color:#fff;text-decoration:none;border-radius:4px">Confirm account</a></p><p>After confirmation, add a passkey or scan the authenticator QR code on your Account page. Never share an authenticator key or recovery code.</p>""",
        )
    }

    override fun sendTest(to: String) {
        send(to, "Constitution Atlas test email", "Your mail configuration is working.", required = true)
    }

    private fun send(to: String, subject: String, body: String, required: Boolean = false, html: String? = null) {
        val properties = properties
        if (!properties.configured()) {
            if (required) throw MailDeliveryException()
            return
        }
        try {
            val sender = mailSender()
            val message = sender.createMimeMessage()
            val helper = MimeMessageHelper(message, html != null, StandardCharsets.UTF_8.name())
            if (properties.fromName.isBlank()) {
                helper.setFrom(properties.from)
            } else {
                helper.setFrom(properties.from, properties.fromName)
            }
            helper.setTo(to)
            helper.setSubject(subject)
            if (html == null) helper.setText(body, false) else helper.setText(body, html)
            sender.send(message)
        } catch (ex: Exception) {
            log.warn("Outbound mail delivery failed ({})", ex.javaClass.simpleName)
            throw MailDeliveryException()
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
        props["mail.smtp.starttls.required"] = properties.startTls.toString()
        props["mail.smtp.ssl.enable"] = properties.ssl.toString()
        props["mail.smtp.ssl.checkserveridentity"] = "true"
        props["mail.smtp.connectiontimeout"] = "5000"
        props["mail.smtp.timeout"] = "5000"
        props["mail.smtp.writetimeout"] = "5000"
        sender.javaMailProperties = props
        return sender
    }
}
