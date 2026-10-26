# Accounts and security

**Start here:** Log in → Account. Section links lead to preferences, account security and connected clients.

## Sign in or request access

1. Open **Log in** and use your password or an enrolled passkey.
2. Enter your authenticator code when requested.
3. Open **Account** to manage your settings.

If **Register** is offered, request access by email. Open the one-use confirmation link within 24 hours and set a password. New accounts start as viewers; an administrator grants editorial roles. Otherwise, ask for an invitation. Use the reset link for your account when recovering a password.

## Secure your account

1. Open **Account → Account security**, confirm your current password and start authenticator setup.
2. Scan the QR code and enter the app's six-digit code. **Can't scan the QR code?** reveals the manual key when needed.
3. Save the new recovery codes privately: they are shown once.
4. Optionally enroll a passkey after confirming your current password.

![Account security and passkey controls](https://raw.githubusercontent.com/wiki/julianhoelz94/Verfassung/media/account-security-en.png)
*Authenticator and passkey controls are grouped in Account security.*

**No authenticator available?** Choose **Use a recovery code** at the challenge. Each code works once. **Use authenticator app instead** returns to normal entry. **Replace recovery codes** opens confirmation and invalidates the old set when completed.

Administrators and publishers need extra verification for protected actions. A fresh MFA check may be requested even when you are already signed in.

An enrolled passkey protects password sign-in too: a password cannot restart first-time enrollment. Choose **Use a passkey** at the challenge or confirmation page. Adding or removing passkeys requires fresh verification when a second factor already exists. Administrators and publishers cannot remove their last second factor. Import credentials require an actual recent second-factor check, including for editor accounts where MFA is otherwise optional.

A password change revokes other sessions, pending enrollment/reset links and personal MCP/OAuth credentials. A password reset, account disablement or role change revokes all sessions, pending enrollment challenges and personal client credentials. Sign in and reconnect affected clients. A disabled invitation cannot activate its account.

## Choose a language or translate content

| Setting | Effect |
| --- | --- |
| **Website language** | Choose English, Deutsch or automatic device language. Saved choices follow your account across devices. Unsupported or disabled choices fall back to the site's configured default. |
| **Translate this content** | Request a machine translation on a supported page. Sign-in and administrator enablement are required. **Show original** restores the source. |
| **Always translate content** | Translate supported content automatically when an authored version in your language is unavailable. |

The interface and guides use maintained translations. Authored language versions take priority over machine translation. Translation is a reading aid; check the source for exact wording. Opting in sends the selected content to the configured provider.

<details>
<summary>Personal translation key and connected research clients</summary>

Under **Content translation**, you can save a personal Google Translate API key. It is encrypted, never displayed again, and uses your Google project quota instead of the site's shared quota. The administrator can disable translation or switch the shared provider between Google and DeepL.

Under **Connected clients**, manage OAuth connections and personal MCP keys, including expiry, rotation and revocation. Copy a new key when shown and keep it private. Grant only required access: editor import access stages material for review and cannot publish. Expand the optional connection instructions for client configuration.

</details>

[[Reading guide|User-Guide]] · [[Editorial guide|Editorial-Guide]] · [[Deutsch|Account-Guide-de]]
