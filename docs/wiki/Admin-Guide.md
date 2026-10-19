# Administration and setup

**Requires: Admin.** Open **Admin** and choose a task.

| I need to… | Open | Finish by… |
| --- | --- | --- |
| Invite someone or change roles | **Users** | Save the roles; revoke sessions if needed. |
| Configure email and registration | **Site settings** | Send a test email before enabling registration. |
| Choose website languages | **Site settings** | Save available languages and the default. |
| Change visitor access | **Anonymous browsing** | Save the policy and limits with fresh MFA. |
| Define a constitution's structure | **Outlines** | Inspect the structure preview before text entry. |
| Import content | **Import** | Choose existing/new structure, upload JSON, inspect the preview and job. |
| Publish operator or privacy details | **Legal pages** | Save, inspect the saved preview, then publish. |

![Administration overview grouped by task](https://raw.githubusercontent.com/wiki/julianhoelz94/Verfassung/media/admin-overview-en.png)
*Choose the task group before opening a workspace.*

![Import page with structure selection before file upload](https://raw.githubusercontent.com/wiki/julianhoelz94/Verfassung/media/admin-import-en.png)
*Choose where the content belongs before uploading. “Paste JSON instead” opens advanced input.*

## First installation


A new installation opens only the setup login until the designated deployment administrator finishes configuration. Production prepares HTTPS before showing the password form. Sign in using the administrator credentials supplied in the deployment environment, complete authenticator setup when requested, and follow the grouped setup page.

Review the available website languages (all supported languages are selected initially), visitor access and registration policy. The visitor-access page offers **Back to setup**, including after saving its policy. Supply and explicitly publish the real shared operator contact details and the required German/English legal texts. Under **Email and self-registration**, **Configure email later** disables SMTP editing, test mail, and self-registration. Save this choice in the same form; existing SMTP details are kept. To offer self-registration later, clear that choice, configure and enable outgoing mail, save valid SMTP settings, and send a test email before enabling registration. New users must confirm their email address. The final review lists remaining required work and opens access only when server validation succeeds.

Setup progress and completion are stored in Identity Postgres. Ordinary container replacement and application upgrades do not restart the wizard. Keep the same databases and encryption key. After completion, settings remain available under **Admin → Site settings**, including languages, access, email, legal information, and connection status. Values supplied through the deployment environment are identified as managed there; secret values are never displayed.

The wizard does not replace verification of actual production operator/hosting information tracked by VER-269.


## Settings and publication details

<details>
<summary>Email, legal pages, translation providers and visitor limits</summary>



Open **Admin** for **Users**, **Site settings**, **Outlines**, and **Import**. Search Users to find accounts, invite people, assign roles, and revoke sessions. In Site settings, configure outgoing mail, send a test email to a specified recipient, and enable or disable self-registration. New installations start with mail and self-registration disabled; configure and test mail before enabling registration. In Outlines, configure the constitution's structure and inspect its preview before authors enter text. In Import, choose an existing constitution or a new structure proposal, then select the JSON file. **Paste JSON instead** opens the advanced text input. Inspect the structure preview and resulting job; staged data is not public until the appropriate review and publication steps finish.

Admin also contains **Legal pages**. Save a private draft of the Impressum or Datenschutzerklärung, review its content and then publish it as a separate action. Confirm real operator details before public launch. Changes to legal pages do not publish constitutional text.

The German and English legal texts have separate drafts and publication steps. Edit the imprint text and its shared name, address and email in one form. Choose **Save draft** once, review the **Saved draft preview**, then choose **Publish reviewed imprint**. Each action updates the selected language's text and the shared contact details together. The other language's text remains unchanged; the published contact record is shared by both languages. Keep contact details out of the prose and replace the sample text before publication. A missing English publication falls back to the German original with a notice.

Validation failures publish neither the text nor contact changes. Errors identify example content, duplicated contact details, or a stale draft that needs reloading. Unsaved edits are not included in publication; review the saved preview before publishing.

An imprint published before this feature may still contain its address in the body. Its public display keeps that legacy body without appending the new shared contact record. Remove the embedded address, save a new draft, and publish it to switch to the shared record.

Under **Admin → Site settings → Content translation**, choose Disabled, Google Translate or DeepL and configure the matching shared API key. Provider changes require a key for the new provider. The shared Google path reserves characters before each provider call and stops at 500,000 characters per UTC month or any rolling 31-day period. Cached results do not consume another reservation. A user's personal Google key bypasses the shared quota. Review provider data handling before enabling translation; source content is sent only after a signed-in user opts in or enables the account-wide automatic setting.

In **Anonymous browsing**, an administrator can allow or block browsing without a signed-in account. Set positive API request limits separately for each IP address and for all anonymous visitors together, using a window in minutes, hours, or days. Saving this setting requires a fresh MFA step-up. When **Allow anonymous browsing** is unchecked, the displayed limits become zero and cannot be edited; the previously saved positive limits return when browsing is allowed again. Sign-in and account creation remain available to visitors when browsing is blocked.


</details>

[[Account guide|Account-Guide]] · [[Editorial guide|Editorial-Guide]] · [[Deutsch|Admin-Guide-de]]
