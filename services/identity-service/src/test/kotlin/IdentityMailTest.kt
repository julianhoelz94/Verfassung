import com.constitutionatlas.identity.config.IdentityMailProperties
import com.constitutionatlas.identity.mail.MailLinks
import com.constitutionatlas.identity.mail.SmtpOutboundMailer
import org.junit.jupiter.api.Test

class IdentityMailTest {
    @Test
    fun configuredRequiresHostFromAndPublicUrl() {
        check(!IdentityMailProperties().configured())
        check(
            !IdentityMailProperties(
                from = "noreply@verfassungen.de",
                publicBaseUrl = "https://verfassungen.de",
            ).configured(),
        )
        check(
            IdentityMailProperties(
                from = "noreply@verfassungen.de",
                publicBaseUrl = "https://verfassungen.de",
                host = "smtp.example",
            ).configured(),
        )
        check(
            !IdentityMailProperties(
                enabled = false,
                from = "noreply@verfassungen.de",
                publicBaseUrl = "https://verfassungen.de",
                host = "smtp.example",
            ).configured(),
        )
    }

    @Test
    fun linksPointAtGatewayResetAndInvitePages() {
        check(
            MailLinks.reset("https://verfassungen.de/", "abc+def") ==
                "https://verfassungen.de/reset?token=abc%2Bdef",
        )
        check(
            MailLinks.invite("https://verfassungen.de", "token") ==
                "https://verfassungen.de/invite?token=token",
        )
    }

    @Test
    fun smtpMailerSkipsSendWhenNotConfigured() {
        SmtpOutboundMailer(IdentityMailProperties()).sendPasswordReset("user@example.local", "token")
        SmtpOutboundMailer(IdentityMailProperties()).sendInvite("user@example.local", "token")
    }
}
