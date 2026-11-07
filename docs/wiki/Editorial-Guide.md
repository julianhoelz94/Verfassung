# Edit, review and publish

**Workflow:** edit → save → submit → approve → publish. Sign-in and MFA: [[Account guide|Account-Guide]]. Site configuration: [[Administration|Admin-Guide]].

## 1. Edit and submit

**Requires: Editor or Admin.**

1. Open a published version and choose **Edit this constitution**.
2. Choose **Correct this text** for a transcription error, or **Record the next legal change** for a change in law.
3. Select a content unit, edit and **Save draft**. Inspect the preview and changes.
4. Describe the change, save the comment, then **Submit for review**.

**Result:** the saved draft waits in the review queue. Open **My work** to find drafts, submitted work, approved work and published results. Each entry shows its current status. Returning to this list keeps saved work. If submission is unavailable, follow the links beside the button to complete the missing information.

Use the **Status** filter to show drafts, work in review, approved work, or published results. **Archive** moves finished edits and imports out of the current list; choose **Archived work** to find and restore them. **Delete draft** asks for confirmation and removes an owned open draft from the workspace. Submitted and published work cannot be deleted; publication and review history are retained.

![Draft editor with text and workflow controls](https://raw.githubusercontent.com/wiki/julianhoelz94/Verfassung/media/editor-draft-en.png)
*Save and inspect the draft before submitting it.*

[▶ Watch editing and submission](https://julianhoelz94.github.io/Verfassung/#editing-a-draft-en)

### Writing and footnotes

The navigation button beside **Edit** hides the article navigation to give the document more width. **Session and publication**, below the document, opens the workflow details when needed. The sticky icon toolbar follows the active text selection and keeps **Undo**, **Redo** and **Editor view** available while scrolling. Its menus contain named actions for inserting units and tables, editing properties, splitting or merging text, and managing references. On phones, the active workspace tab keeps its label and the other tabs use icons. **Changes** collects the session's wording, formatting, note and structural differences. Save the draft before submitting it for review.

Use **Bold**, **Italic**, **Underline**, and **Strikethrough** for the selected text or continued typing. **Undo** and **Redo** are disabled when their history is empty. Strikethrough is a text style; it does not record a repeal.

Constitution structure settings determine whether leaf units appear as flowing text or on separate lines. When automatic sentence creation is enabled for a leaf level, typing its configured punctuation creates the next sentence while retaining the cursor in the text. The default delimiters are period, exclamation mark and question mark. Levels with child kinds cannot use automatic sentence creation. **Show sentence boundaries** adds boxes only in flowing text and does not change the stored wording.

Edited sentence text is saved without surrounding spaces; flowing text supplies the gap between sentences. Press **Enter** between sentences to insert a saved line break, or Enter again for a blank line. These breaks survive saving and appear in Preview and the public reader. Clicking text gives the active editing passage more room while surrounding text stays compact.

Choose **Footnotes → New footnote…** to add a literal label and note at the constitution's end, with its marker at the selected cursor position. The labelled pencil button on the actual note edits it in place. Hovering or focusing a marker previews its note; clicking it opens a bottom drawer and keeps the reading position. Close the drawer with **×**, **Escape**, or a click outside it. **Go to footnote** explicitly jumps to the actual note at the end. Import validation rejects a note followed by later body content; published historical text remains available.

Right-click a marker for **Edit footnote**, **Move marker…**, **Remove marker**, or **Go to footnote**. The same actions are available from Footnotes and through keyboard context menus. One footnote may have several markers, including in different articles; **Footnotes → Add marker for footnote…** can reference an already-linked note. Moving retains the selected marker's old anchor until you choose a caret position and confirm **Place marker**. Moving or removing that marker leaves the note's other markers unchanged. Editing the note updates the shared text displayed by all of its markers.

Removing a marker keeps the note. Every note needs at least one marker before saving; removing its last marker blocks Save until you attach it again from Footnotes. The same rule applies to all constitution imports and new content snapshots, including source-information-only publication. Multiple markers are accepted. Published historical text remains readable. **This article** displays only notes referenced by the current article. Preview uses the reader's article headings, paragraph labels, and numbered endnote presentation.

**Wiki** edits the constitution's context page independently of its legal text. Short description and page text stay visible; Sources, Pictures and revision history open on demand. Save the Wiki draft separately; a publisher reviews and publishes it. **Details** edits the title and, under Advanced, the URL slug while retaining old aliases. Version facts remain read-only. Archival source corrections, structural settings and lifecycle events retain their own workflows. Pending text and publication details must be saved before leaving through one of these workflows.

### Documents and legal amendments

Open **Documents** in the top bar for the shared library. Editors/admins maintain
bibliography, citation keys, tags and files. Reviewers/publishers read the library
and history, download and export. The library is private; published citations keep
their existing visibility rules.

**All documents** contains every record regardless of project folders. Drag a
document onto a folder or use **Add to folder** to assign its tag. A record may
belong to several folders. **Remove from this folder** removes only that membership;
**Remove folder view** keeps documents and tags. Bulk organization offers **Undo**.
Search covers titles, keys, authors, years and tags.

The shared toolbar shows or hides project folders and document details. Select a
record to open its bottom drawer; Close or Escape hides it while preserving typed
fields. Resize the drawer on desktop using its top handle or arrow keys. Phones
use a nearly full-height drawer. Descriptive tags are managed in document details;
folder backing tags are not repeated as a second sidebar list.

Citation keys must be unique across the library, including archived records.
Renaming retains the old key as an alias. Details provides bibliography, files,
usage and history. File changes create revisions; existing published citations
retain their original bibliography and files.

**Import BibTeX** works in All documents or a project folder. Upload a `.bib` file
or paste its content, preview, resolve duplicate/key conflicts and confirm each
entry's action. Folder import adds its tag to created or explicitly reused records,
which remain in All documents. File references require separate uploads.
**Export folder** includes the whole folder beyond the current results page;
**Export selected** and **Export library** provide the other scopes. Importing
references does not publish them. Every export menu offers **BibTeX only (.bib)**
or **BibTeX with files (.zip)**. ZIP exports contain `references.bib` and all files
in the exported revisions, with relative paths in each entry's `file` field.
Extract the ZIP before using those paths. BibTeX-only exports omit `file` entirely;
entries without attachments also omit it. Selected archived records can be
exported; library/folder exports include active records.

**Documents** in the constitution editor opens the central document library controls in place. **Upload new document** and **Choose existing document** have the same visual weight. Upload a PDF or text file (up to 20 MB), enter its title, and choose **Upload and attach**. Alternatively, supply a source URL and choose **Create and attach**. One submission creates the central record and links its pinned revision. Existing records can be searched and attached at a selected revision; **Detach** removes the link while retaining the library record. Text, comments and unfinished inputs stay in the workspace while these controls are open. The document title opens the cited snapshot; manage library history in Documents.

A legal amendment has **one before constitution and one after constitution**, selected above **Affected passages**. **Find affected passages** uses this pair across the whole constitution; unchanged articles do not each require review. The public amendment comment remains visible above the affected passages. Passage notes describe individual changes. **Correct passage mapping** selects exact locations within the amendment's shared pair; it does not choose another pair for that article. Source formatting and exact snapshot identities are available on demand.

The amendment menu provides **Details**, **Review**, **Documents**, **History** and **Publication**. **Review** retains detected differences, saved progress, filters, linked change rows, exclusions and reviewer acknowledgements. Save a changed constitution pair before reviewing it. **History** inspects past revisions without replacing the current unsaved form; restoring creates a new draft. Save a new amendment before attaching managed documents. Published amendment attachments retain immutable document pins; edit attachments on the current unpublished draft. **Older source references** shows earlier inline URL/file references separately.

**Save draft** never publishes. **Publication** has a separate confirmation and command; unresolved differences or unsaved form changes block the publication button. Quote confirmation and withdrawal also remain explicit publication actions. Document attachments follow their target's visibility rules; adding evidence to a publicly readable constitution can make that pinned document readable without creating another constitution version.

### Reusing sources in context

The compact document controls also appear in published amendment/change materials, saved lifecycle/provision events, and **Sources for this text version** under **Details → Archival source** and source-information editing. Constitution-wide attachments and version-specific sources have separate scopes. Record an event first, then open its sources section. Publishers can select existing event sources; library uploads require Editor/Admin rights as well.

Search updates while typing and keeps the suggestions visible. Use the arrow keys and Enter to select, then **Attach document** to save. **Citation options** chooses a saved document revision. **Citation note / relevant passage** stores a chapter, page reference or explanation on this attachment, independently of the document’s shared Description and published Abstract. Reusing a source elsewhere preserves that context’s own note. Uploading, attaching and detaching save in place without discarding the surrounding text draft. Supporting-source attachments save separately from reviewed narrative source corrections.

## 2. Review

**Requires: Reviewer or Admin.**

1. Open **Review queue**, then the submitted session.
2. Compare draft and source; inspect the comment, affected units and change type.
3. Approve only when the text is ready. Source corrections support **Request changes** with a reason. Text-only editing sessions currently have no return action; leave work unapproved if they need changes. Imported constitutions have a separate rejection action.

**Result:** approved work appears under **Ready to publish**. Approval does not publish it.

![Submitted draft awaiting review](https://raw.githubusercontent.com/wiki/julianhoelz94/Verfassung/media/editor-review-en.png)
*Check the proposed text and its context before approval.*

[▶ Watch review and approval](https://julianhoelz94.github.io/Verfassung/#reviewing-a-draft-en)

### Correct source information

Choose **Edit source information** directly in the **Archival source** block on the current reading version. Editors and administrators design the **Source description** in one free text field. Paragraphs, headings (`#`), lists (`-`) and links (`[text](https://…)`) are supported; **Preview source description** shows the result. Date wording, import coverage, status and attribution have no separate required fields. Existing information is carried into the description in full and can be arranged freely. The general legal-validity notice remains fixed site text.

The **Reason for the correction** has its own section and belongs only to the editing history.

Save the source draft with that reason, then compare the published and saved values. The history retains every saved revision and records accounts, timestamps and review decisions. Unsaved fields block submission; stale-write errors retain your input.

Submitting locks the draft. A reviewer can approve the displayed revision or request changes with a reason. A requested correction requires a new saved source revision and another submission. As with text corrections, a non-admin cannot approve their own session.

A publisher explicitly publishes the approved correction after fresh MFA. Only then does a new editorial snapshot show the changed source information. Historical snapshots remain unchanged; a source-only correction reuses all constitutional text revisions. If the session also contains text changes, inspect them through **Inspect the constitutional text in this session** before approval.

### Imported constitutions

MCP and file uploads appear in the editor's **Review queue**, alongside submitted editing sessions. Open the import to inspect its source, submitted structure and prepared reader preview. If needed, an Editor/Admin confirms the outline and prepares the unpublished draft first. A Reviewer/Admin then enters a reason and approves or rejects it. Approved imports appear under **Ready to publish**; a Publisher/Admin publishes the exact approved draft after fresh MFA.

The same account can upload, review and publish when it holds the required roles. No second account is required. Approval and publication remain separate actions. Existing import links open this editor journey.

Import review places the constitution title, version and reader preview ahead of technical identifiers. Approval and rejection each have an aligned reason field and action button. Open **Technical details** when you need the import ID, draft version ID, content generation or settings revision.

The current step is shown prominently above the content. After approval it reads **Approved – publication pending** and only publication is offered to an authorized Publisher/Admin. Approval/rejection controls disappear after review; completed and rejected imports have no publication action. **Check content and structure** links directly to the submitted hierarchy, using the confirmed layout. Publication errors distinguish server credential/configuration problems from a changed approved draft, permission problems, and temporary failures. A failed publication never by itself proves that nothing was published: reload and check the current status before retrying.

## 3. Publish

**Requires: Publisher or Admin.**

1. Open **Ready to publish**, then the approved session.
2. Confirm the text and change type. Complete fresh MFA if requested.
3. Publish, choose **Open published version**, and check the new text. The same link remains available when you reopen the published work.

**Result:** a successor snapshot is public. The previous snapshot remains available. A transcription correction does not itself record a new law.

![Approved draft before publication](https://raw.githubusercontent.com/wiki/julianhoelz94/Verfassung/media/editor-publish-en.png)
*Publication is a separate decision after approval.*

[▶ Watch publication](https://julianhoelz94.github.io/Verfassung/#publishing-a-revision-en)

## Other editorial tasks

The workspace provides direct links to **Documents**, **Legal changes** and **Text history**. Review and publication queues appear for people with the corresponding permissions.


- Use **Legal changes** to draft and link an amendment or other legal change to exact affected provisions. Review the source and target links before publication.
- Use **Documents** to add source files, create file revisions, and link them to constitutions or legal changes. A file revision is distinct from a constitutional text revision.
- On country, regional and historical-jurisdiction pages, open **Wiki → Edit wiki**. It opens a named workspace for that jurisdiction, with summary, text, sources, pictures and revision history. Save the private draft; **Review wiki** lets Reviewers/Publishers inspect it, and an authorized Publisher/Admin publishes the selected revision. **View public page** returns with Wiki open. Constitution wikis keep their existing editor entry point. Wiki publication remains separate from constitutional text.
- Use **Lifecycle** on a constitution to record adoption, commencement, suspension, restoration, repeal, and provision events. Check effective dates and the public constitution timeline after recording an event.


<details>
<summary>Roles and version history</summary>



| Role | Main work |
| --- | --- |
| Viewer | Read published material. |
| Editor | Open and save draft sessions, submit them for review, and draft legal change records. |
| Reviewer | Inspect and approve submitted work; imported constitutions can also be rejected. Review alone does not permit editing. |
| Publisher | Publish approved work after fresh MFA; publication rights alone do not permit editing or approval. |
| Admin | Manage users and content setup, and perform editorial actions. |

The editorial path is **open → save → submit for review → approve → publish**. Publication creates a successor snapshot. The previous published snapshot remains available. Check the chosen **legal change** or **transcription correction** path before starting a session, since those represent different histories.


**Legal changes** describe changes in law; **Text history** shows published text revisions. Exact permissions: [editorial roles](https://github.com/julianhoelz94/Verfassung/blob/main/docs/editorial-roles.md).

</details>

The silent clips use fictional content and separate editorial roles. The written steps above describe the same workflow.

[[Documentation home|Home]] · [[Deutsch|Editorial-Guide-de]]

### Review a new constitution proposed by a chat client

The private proposal page shows its source, read-only hierarchy, actual representative sample and display settings. Ask the connected chat client to change the hierarchy; manual constitution creation still has full hierarchy controls. You can change names such as **Art.** versus **Artikel** and preview display changes without changing internal structure codes. Saved display preferences carry forward when the chat revises matching kinds.

Use **Request changes through your chat client** to record feedback, then ask the client to read the proposal again through MCP. The site does not send a message automatically. A revised proposal shows what changed and retains the previous sample for comparison. Load the latest proposal after the chat updates it; stale saves and confirmation are rejected. Confirmation is blocked while a requested revision is outstanding.

Choose **Confirm structure and enable full upload** after reviewing the current sample. The chat client must wait for this website confirmation before uploading the full text. Then continue in the chat; it retrieves the confirmed settings itself. This confirms the setup only. The uploaded text still requires review, approval and explicit publication.

You can choose or upload sources before first saving an amendment or a lifecycle/provision event. Selections are linked after the record is saved; uploads stay in the shared library even if you cancel the record. Failed saves preserve your entries and retries reuse the saved record. Publishers can choose event sources; uploading library records requires editor/admin rights.

Wiki editors can reuse existing images while supplying page-specific alt text and credits, and add revision-pinned bibliography with a relevant-passage note. Import, setup and migration reviews offer supplementary evidence without changing original captures or checksums. In the text editor, **References → Cite a document**, or the same control while editing a footnote, links selected text to an exact source revision. Save/apply the text draft and use the normal publication workflow to make its citations public.
