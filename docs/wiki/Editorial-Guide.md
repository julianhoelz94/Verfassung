# Accounts and editorial work

Your available pages and buttons depend on your assigned roles. Hiding a button is a convenience; the server also checks authorization. A user may have more than one role.

## Sign in and secure your account

1. Choose **Log in** from the account menu. Use your password or an enrolled passkey, and follow any authenticator challenge. When an administrator has enabled registration, use **Register** on the login page to request an account by email.
2. For registration, open the one-use email confirmation link within 24 hours and set your password. The new account starts as a viewer; an administrator must grant editorial roles. If registration is unavailable, ask an administrator for an invitation.
3. Open **Account** to review your account and set up an authenticator using the QR code or manual key. Save the recovery codes privately. You can enroll a passkey after entering your current password. Administrator and publisher accounts require additional verification for protected actions.
4. For a protected publication action, complete the requested fresh MFA **step-up**. A prior login alone may no longer be recent enough.
5. Use the reset or invitation link sent for your account when setting or recovering a password. Ask an administrator if your role or access is wrong.

### Choose a language

Under **Account → Language**, choose **Automatic (device language)**, **English**, or **Deutsch**. Automatic uses your device or browser language and falls back to English when that language is unavailable. An explicit choice is saved with your account and follows you to other devices. This changes the website interface and guide language, not the wording of published constitutional texts.

## Role summary

| Role | Main work |
| --- | --- |
| Viewer | Read published material. |
| Editor | Open and save draft sessions, submit them for review, and draft legal change records. |
| Reviewer | Inspect submitted work and approve or reject it; review alone does not permit editing. |
| Publisher | Publish approved work after fresh MFA; publication rights alone do not permit editing or approval. |
| Admin | Manage users and content setup, and perform editorial actions. |

The editorial path is **open → save → submit for review → approve → publish**. Publication creates a successor snapshot. The previous published snapshot remains available. Check the chosen **legal change** or **transcription correction** path before starting a session, since those represent different histories.

## Watch the editorial workflow

These silent, human-paced recordings use fictional local test content. They demonstrate a transcription correction, with a separate person handling each role:

1. [Edit a draft and submit it for review](media/editing-a-draft.webm)
2. [Review and approve the draft](media/reviewing-a-draft.webm)
3. [Publish the approved revision](media/publishing-a-revision.webm)

The clips do not show sign-in or real account credentials. A live publisher may be asked for fresh MFA before the final action.

## Edit and review a constitution

1. Browse to a published version and choose **Edit this constitution**. Select **Correct this text** for a transcription error or **Record the next legal change** for a change in law. Return to unfinished work through **Editor → My open sessions**.
2. Choose the constitution, source version, and content unit. Edit the structured content and save. Review the preview and the changes list, including source and target links, before submission.
3. Submit the session. A reviewer opens **Review queue**, checks the proposed text and context, and approves or returns the work according to the controls shown.
4. A publisher opens **Ready to publish**, confirms the approved revision and change type, completes MFA step-up, and publishes. Check the resulting version page and indexing status.

**Legal changes** and **Snapshot history** are separate editorial views. A legal change record can describe the law and link exact affected units. Snapshot history shows the published text revisions and their relationship. A transcription correction does not itself create a new law.

## Other editorial work

- Use **Legal changes** to draft and link an amendment or other legal change to exact affected provisions. Review the source and target links before publication.
- Use **Documents** to add source files, create file revisions, and link them to constitutions or legal changes. A file revision is distinct from a constitutional text revision.
- Use the country or constitution page's edit action to draft contextual background and pictures. Save the private draft, then have a publisher inspect its preview and publish that page revision separately from constitutional text.
- Use **Lifecycle** on a constitution to record adoption, commencement, suspension, restoration, repeal, and provision events. Check effective dates and the public constitution timeline after recording an event.

## Admin tasks

Open **Admin** for **Users**, **Account settings**, **Outlines**, and **Import**. Search Users to find accounts, invite people, assign roles, and revoke sessions. In Account settings, configure outgoing mail, send a test email to a specified recipient, and enable or disable self-registration. New installations start with mail and self-registration disabled; configure and test mail before enabling registration. In Outlines, configure the constitution's structure and inspect its preview before authors enter text. In Import, upload content into the reviewed staging flow and inspect the resulting job; staged data is not public until the appropriate review and publication steps finish.

Admin also contains **Legal pages**. Save a private draft of the Impressum or Datenschutzerklärung, review its content and then publish it as a separate action. Confirm real operator details before public launch. Changes to legal pages do not publish constitutional text.

The German and English legal texts have separate drafts and publication steps. Maintain the imprint's mandatory name, address and email in the shared contact fields; publish those reviewed fields before publishing either imprint text. Keep those details out of the language-specific body so a later address change has one source. Do not publish the sample legal text. A missing English publication falls back to the German original with a notice.

When no shared contact record is published, **Publish reviewed text** is disabled and links to **Edit shared contact details**. Use **Save contact draft**, then **Publish reviewed contact**, and finally publish the reviewed text for each language. Publication errors identify example content, duplicated contact details, or a changed draft that needs reloading.

An imprint published before this feature may still contain its address in the body. Its public display keeps that legacy body without appending the new shared contact record. Remove the embedded address, save a new draft, and publish it to switch to the shared record.

Under **Admin → Account settings → Content translation**, choose Disabled, Google Translate or DeepL and configure the matching shared API key. Provider changes require a key for the new provider. The shared Google path reserves characters before each provider call and stops at 500,000 characters per UTC month or any rolling 31-day period. Cached results do not consume another reservation. A user's personal Google key bypasses the shared quota. Review provider data handling before enabling translation; source content is sent only after a signed-in user opts in or enables the account-wide automatic setting.

In **Anonymous browsing**, an administrator can allow or block browsing without a signed-in account. Set positive API request limits separately for each IP address and for all anonymous visitors together, using a window in minutes, hours, or days. Saving this setting requires a fresh MFA step-up. When **Allow anonymous browsing** is unchecked, the displayed limits become zero and cannot be edited; the previously saved positive limits return when browsing is allowed again. Sign-in and account creation remain available to visitors when browsing is blocked.

## Connect a research client

The **Account → Connect a chat client** section offers OAuth connections and personal MCP keys. Grant only the access your client needs; editor import access stages material for review and cannot publish it. The page shows connected clients and keys, expiration, rotation and revocation controls. Copy a new key when it is shown and keep it private.

For exact permissions, see [editorial roles](https://github.com/julianhoelz94/Verfassung/blob/main/docs/editorial-roles.md). For public reading, see [[Website user guide|User-Guide]]. · [[Deutsch|Editorial-Guide-de]]
