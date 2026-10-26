# Edit, review and publish

**Workflow:** edit → save → submit → approve → publish. Sign-in and MFA: [[Account guide|Account-Guide]]. Site configuration: [[Administration|Admin-Guide]].

## 1. Edit and submit

**Requires: Editor or Admin.**

1. Open a published version and choose **Edit this constitution**.
2. Choose **Correct this text** for a transcription error, or **Record the next legal change** for a change in law.
3. Select a content unit, edit and **Save draft**. Inspect the preview and changes.
4. Describe the change, save the comment, then **Submit for review**.

**Result:** the saved draft waits in the review queue. Resume unfinished work through **My open sessions**; returning to the session list keeps saved work.

![Draft editor with text and workflow controls](https://raw.githubusercontent.com/wiki/julianhoelz94/Verfassung/media/editor-draft-en.png)
*Save and inspect the draft before submitting it.*

[▶ Watch editing and submission](https://julianhoelz94.github.io/Verfassung/#editing-a-draft-en)

## 2. Review

**Requires: Reviewer or Admin.**

1. Open **Review queue**, then the submitted session.
2. Compare draft and source; inspect the comment, affected units and change type.
3. Approve the review or return the work using the available controls.

**Result:** approved work appears under **Ready to publish**. Approval does not publish it.

![Submitted draft awaiting review](https://raw.githubusercontent.com/wiki/julianhoelz94/Verfassung/media/editor-review-en.png)
*Check the proposed text and its context before approval.*

[▶ Watch review and approval](https://julianhoelz94.github.io/Verfassung/#reviewing-a-draft-en)

### Imported constitutions

MCP and file uploads appear in the editor's **Review queue**, alongside submitted editing sessions. Open the import to inspect its source, submitted structure and prepared reader preview. If needed, an Editor/Admin confirms the outline and prepares the unpublished draft first. A Reviewer/Admin then enters a reason and approves or rejects it. Approved imports appear under **Ready to publish**; a Publisher/Admin publishes the exact approved draft after fresh MFA.

The same account can upload, review and publish when it holds the required roles. No second account is required. Approval and publication remain separate actions. Existing import links open this editor journey.

Import review places the constitution title, version and reader preview ahead of technical identifiers. Approval and rejection each have an aligned reason field and action button. Open **Technical details** when you need the import ID, draft version ID, content generation or settings revision.

The current step is shown prominently above the content. After approval it reads **Approved – publication pending** and only publication is offered to an authorized Publisher/Admin. Approval/rejection controls disappear after review; completed and rejected imports have no publication action. **Check content and structure** links directly to the submitted hierarchy, using the confirmed layout. Publication errors distinguish server credential/configuration problems from a changed approved draft, permission problems, and temporary failures. A failed publication never by itself proves that nothing was published: reload and check the current status before retrying.

## 3. Publish

**Requires: Publisher or Admin.**

1. Open **Ready to publish**, then the approved session.
2. Confirm the text and change type. Complete fresh MFA if requested.
3. Publish, then open the resulting version and check its text and indexing status.

**Result:** a successor snapshot is public. The previous snapshot remains available. A transcription correction does not itself record a new law.

![Approved draft before publication](https://raw.githubusercontent.com/wiki/julianhoelz94/Verfassung/media/editor-publish-en.png)
*Publication is a separate decision after approval.*

[▶ Watch publication](https://julianhoelz94.github.io/Verfassung/#publishing-a-revision-en)

## Other editorial tasks


- Use **Legal changes** to draft and link an amendment or other legal change to exact affected provisions. Review the source and target links before publication.
- Use **Documents** to add source files, create file revisions, and link them to constitutions or legal changes. A file revision is distinct from a constitutional text revision.
- Use the country or constitution page's edit action to draft contextual background and pictures. Save the private draft, then have a publisher inspect its preview and publish that page revision separately from constitutional text.
- Use **Lifecycle** on a constitution to record adoption, commencement, suspension, restoration, repeal, and provision events. Check effective dates and the public constitution timeline after recording an event.


<details>
<summary>Roles and version history</summary>



| Role | Main work |
| --- | --- |
| Viewer | Read published material. |
| Editor | Open and save draft sessions, submit them for review, and draft legal change records. |
| Reviewer | Inspect submitted work and approve or reject it; review alone does not permit editing. |
| Publisher | Publish approved work after fresh MFA; publication rights alone do not permit editing or approval. |
| Admin | Manage users and content setup, and perform editorial actions. |

The editorial path is **open → save → submit for review → approve → publish**. Publication creates a successor snapshot. The previous published snapshot remains available. Check the chosen **legal change** or **transcription correction** path before starting a session, since those represent different histories.


**Legal changes** describe changes in law; **Snapshot history** shows published text revisions. Exact permissions: [editorial roles](https://github.com/julianhoelz94/Verfassung/blob/main/docs/editorial-roles.md).

</details>

The silent clips use fictional content and separate editorial roles. The written steps above describe the same workflow.

[[Documentation home|Home]] · [[Deutsch|Editorial-Guide-de]]

### Review a new constitution proposed by a chat client

The private proposal page shows its source, read-only hierarchy, actual representative sample and display settings. Ask the connected chat client to change the hierarchy; manual constitution creation still has full hierarchy controls. You can change names such as **Art.** versus **Artikel** and preview display changes without changing internal structure codes. Saved display preferences carry forward when the chat revises matching kinds.

Use **Request changes through your chat client** to record feedback, then ask the client to read the proposal again through MCP. The site does not send a message automatically. A revised proposal shows what changed and retains the previous sample for comparison. Load the latest proposal after the chat updates it; stale saves and confirmation are rejected. Confirmation is blocked while a requested revision is outstanding.

Choose **Confirm structure and enable full upload** after reviewing the current sample. The chat client must wait for this website confirmation before uploading the full text. Then continue in the chat; it retrieves the confirmed settings itself. This confirms the setup only. The uploaded text still requires review, approval and explicit publication.
