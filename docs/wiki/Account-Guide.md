# Accounts and security

**Start here:** Log in → Account → preferences, security or connected clients.

## Sign in and secure your account


1. Choose **Log in** from the account menu. Use your password or an enrolled passkey, and follow any authenticator challenge. When an administrator has enabled registration, use **Register** on the login page to request an account by email.
2. For registration, open the one-use email confirmation link within 24 hours and set your password. The new account starts as a viewer; an administrator must grant editorial roles. If registration is unavailable, ask an administrator for an invitation.
3. Open **Account → Account security** to set up an authenticator. Scan the QR code, then enter the app’s six-digit code. Use **Can’t scan the QR code?** only when you need the manual setup key. Save the recovery codes privately. You can enroll a passkey after entering your current password. Administrator and publisher accounts require additional verification for protected actions.
4. For a protected publication action, complete the requested fresh MFA **step-up**. A prior login alone may no longer be recent enough.
5. Use the reset or invitation link sent for your account when setting or recovering a password. Ask an administrator if your role or access is wrong.

### Choose a language

Under **Account → Language**, choose **Automatic (device language)**, **English**, or **Deutsch**. Automatic uses your device or browser language and falls back to English when that language is unavailable. An explicit choice is saved with your account and follows you to other devices. This changes the website interface and guide language, not the wording of published constitutional texts.

### Recovery and connected clients

Normal MFA sign-in shows the authenticator-code field. Choose **Use a recovery code** when your authenticator is unavailable; choose **Use authenticator app instead** to return. Only the selected method is submitted. Each recovery code works once. In Account security, **Replace recovery codes** opens the confirmation form; replacement invalidates the old codes. Newly generated codes are shown once so you can save them.

Account has section links for language/preferences, security and connected clients. Connection instructions and the command example are optional details; key creation, expiry and revocation remain available in the connected-clients section. Leaving an editor through **Back to my sessions** does not delete saved work.


## Language and content translation


The website follows your device language when it supports it (currently English and German); otherwise it uses the site default. The administrator may restrict the available website languages; a disabled saved preference falls back to the configured default. In **Account**, choose **Website language** to use a specific language or return to **Automatic device language**. Interface text and these guides are maintained translations, not generated while you browse.

Constitution, amendment, and background content can remain in its source language. On supported content pages, select **Translate this content** to request a machine translation into your website language. Sign-in is required; visitors who are not signed in see the control and a sign-in prompt. The translated view always offers **Show original**. Machine translation is an aid to reading; check the original and cited source for exact wording. If an editor has published a version in your language, the site shows that authored version first.

In **Account → Content translation**, enable **Always translate content** to apply this choice automatically on supported pages when no authored version is available. You can also enter a personal Google Translate API key. The key is encrypted on the server, is never shown again, and is used only for your translation requests. It uses your own Google project quota instead of the site's shared Google quota. The administrator may disable machine translation for the whole site or switch between Google and DeepL. When enabled, the text you choose to translate is sent to that provider.

The English and German imprint texts are published separately. Operator address and contact details are maintained once and displayed with either language version.


## Connected research clients


The **Account → Connect a chat client** section offers OAuth connections and personal MCP keys. Grant only the access your client needs; editor import access stages material for review and cannot publish it. The page shows connected clients and keys, expiration, rotation and revocation controls. Copy a new key when it is shown and keep it private.


![Account security and passkey controls](https://raw.githubusercontent.com/wiki/julianhoelz94/Verfassung/media/account-security-en.png)
*Security settings are grouped in the Account page. No credentials are shown.*

[[Reading guide|User-Guide]] · [[Editorial guide|Editorial-Guide]] · [[Deutsch|Account-Guide-de]]
