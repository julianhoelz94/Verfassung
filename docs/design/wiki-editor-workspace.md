# Wiki editing workspace

Country, jurisdiction (including historical regions) and constitution Wikis use `WikiEditorTemplate` / `WikiWorkspaceView`, both standalone and embedded in the constitution editor. `WikiWorkspace` owns loading, owner validation and role gates. The workspace follows the approved Wiki mock: editorial heading, shared PageChrome task tabs, writing surface, optional right preview, and separate save and publication review.

## Editing and preview

Content, Sources & media and History are task tabs with arrow/Home/End keyboard navigation. Keep inactive panels and the citation composer mounted: optional upload fields, selected files, citation locators and editor undo history must survive tab/pane changes and in-place saves. The canonical `DocumentAttachmentTemplate`, through `StagedDocumentPicker`, owns search/upload; do not copy or restore the legacy picker. Controlled `references` hydrate the linked cards without remounting an unfinished upload. Reject detaching sources still cited in the text.

`WikiWritingSurface` uses a separate, closed ProseMirror schema. It supports paragraphs, three heading levels, quotes, ordered/bulleted lists, bold, italic, underline, six ink colors, Undo/Redo and platform shortcuts. Formatting and citation commands create separate history boundaries. Paste supports the same grammar; copied citation occurrences acquire fresh UUIDs while retaining the exact document revision and locator.

An inline citation stores only `{id, documentId, revision, locator}`. `id` identifies its occurrence; `revision` is the positive numeric Document revision. Number references in reading order, reusing a number for the same document/revision/trimmed locator. Resolve canonical document titles on the server. One Wiki snapshot may use only one revision per document across citations and images. The bibliography remains usable without inline occurrences; additional HTTP(S) links are supplementary websites.

`WikiPanel` + `WikiContent` own the final viewer. The right pane, Open viewer, publication review, historical snapshots and public pages use those components with the same typography. Host CSS owns only framing and layout. Authenticated previews use the exact authenticated image revision URL; published pages use public pinned image URLs.

## Retention, save and publication

Working text, image presentation and document references are retained under the signed-in actor and Wiki owner in this browser. If the saved base has advanced, offer explicit recovery against the newest revision; never silently overwrite it. Files cannot be restored from local storage. Warn before leaving with an unsaved replacement file, active upload, or a draft that storage could not retain. Keep optional upload fields mounted across task changes; do not claim those unsent fields survive a browser reload.

Save is an in-place command. Derive a stable operation UUID from the exact submission identity and reuse it on retry, including retries after Catalog saved but Document pinning failed. Catalog's `expectedRevisionId` prevents overwriting a newer draft. Image replacements have a separate deterministic receipt per image. A directly cited image must lose its inline references before its file can be replaced. Pins attach only to the returned saved Wiki revision and canonical owner kind.

Publication is explicit and uses the latest saved revision. Editors/Admins can edit and save. Reviewers can inspect. Publishers/Admins can publish. Dirty drafts, pending uploads, invalid content and already published snapshots cannot be published. Catalog rechecks every document/image pin before publication; published snapshots and old revisions remain immutable.

## Stored rich document contract

Catalog V37 adds nullable `wiki_page_revisions.body_document` JSONB. Save/revision DTOs expose `bodyDocument`. Existing records retain their legacy `body`; a rich save also derives that safe plain-text mirror. A legacy page is converted only after a text edit, preserving headings, lists and literal text.

Both gateway and Catalog validate an allowlist, with Catalog authoritative: at most 200,000 JSON characters, 5,000 nodes, depth 12, 20,000 plain-text characters and 1,000 distinct inline occurrences. Reject unknown fields/marks, executable HTML, invalid colors, malformed IDs, duplicate occurrence IDs and references missing from or conflicting with the citation manifest. General citations remain limited to 100 documents. Do not persist full client Document records or arbitrary HTML in this JSON.

## Verification

Unit tests exercise the grammar, canonical server resolution and retry receipts, mounted workspace retention/recovery, formatting history, citation insertion and permission controls. Catalog tests cover persistence, retries, stale saves, publication and immutable history. Browser journeys verify all three owners, EN/DE, 390/1440px, optional picker metadata, public/preview typography parity, pinned citations and axe. Update golden images only in the pinned Playwright Linux image. The prototype's checks do not establish production integration.
