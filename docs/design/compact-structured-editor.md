# Compact structured constitution editor

Complete design and delivery plan · 28 October 2026

## 1. Outcome and boundaries

The editor should let an editor write constitutional text continuously, retain its legal structure, and understand pending changes without surrounding every sentence with forms. The document receives most of the available width. A small, persistent toolbar exposes tools for the current selection. Detailed controls appear only when requested.

This plan covers the compact interface, continuous typing, automatic sentence nodes, configured presentation, inline formatting, endnotes, shared import validation, review, accessibility, and delivery. The accompanying interactive mock uses example data. Its local behavior does not constitute implementation or deployment of the backend rules.

The interaction prototype was reviewed before implementation. This document records the accepted behavior and its acceptance criteria.

## 2. Agreed product rules

1. Use a document-like canvas and one contextual toolbar.
2. Make the article/outline navigation hideable. Its width goes to the document when hidden.
3. Combine icons in a continuous bar. Avoid repeated boxes, arrows, insertion rows, and full-width menus.
4. Keep the toolbar accessible while scrolling a long constitution, including around Article 20.
5. Use small anchored menus. Show one focused editor or settings panel at a time.
6. Expose every existing editing capability through an identifiable control; remove repeated controls only after their replacements work.
7. Use precise labels. “New footnote…” opens an editor. “Insert marker and note” confirms creation. “Reference existing footnote…” creates a reference to an existing note.
8. Edit footnote text in its displayed position.
9. Footnote bodies belong at the end of the constitution. Inline markers may occur inside its body text.
10. Hovering or focusing a marker reveals its note. Clicking/tapping remains usable.
11. The reading preview does not show placement instructions such as “After paragraph (1), Article 1.”
12. Label the local sentence rendering preview “Preview.”
13. Automatic sentence creation is optional, enabled only on a leaf level, and has configurable delimiters.
14. Respect the constitution’s sentence presentation: flowing text or one sentence per line.
15. Show the sentence-boundary toggle only in flowing mode. Use a dashed-box icon in the toolbar.
16. Provide bold, italic, underline, and strikethrough.
17. Provide Undo and Redo. Disable and visually mute each when its history is empty.

## 3. Screen composition and progressive disclosure

The default workspace consists of:

- a compact identity/status area;
- a small view/history row;
- a continuous context toolbar;
- the document;
- a concise draft status and save action.

The optional navigation contains countries/constitutions where relevant, then articles and deeper structural units. It can be opened and closed without discarding edits or changing selection. Remember its state as a view preference.

Maintain separate concepts for:

- **Editor view:** temporary scope, navigation, boundary outlines, and visibility;
- **Constitution structure settings:** versioned hierarchy, presentation, segmentation, and delimiters;
- **Draft content:** wording, formatting, legal labels, notes, links, and structure.

The toolbar names its target, such as “Article 1 › Paragraph (1) › Sentence 2.” Selecting a paragraph or another unit must change the applicable tools and target explicitly. Avoid unexplained buttons that look like labels, and labels that read like actions.

The editor must not require a permanent preview column, metadata column, or open configuration form. The local preview can be disclosed on demand; the complete preview is a separate view.

## 4. Toolbar and discoverability

Use one consistent open-source icon set, such as the Lucide icons already used by the prototype.

| Group | Icon | Behavior |
|---|---|---|
| Bold | Bold | Toggle bold for the selection or continuing typing |
| Italic | Italic | Toggle italic |
| Underline | Underline | Toggle underline |
| Strikethrough | Strikethrough | Toggle strikethrough |
| Sentence boundaries | SquareDashed | Toggle outlines; present only for flowing text |
| Insert | Plus | Text, sentence/unit, paragraph, table, and note creation |
| Text tools | TextCursorInput | Split, merge, boundary suggestions, and sentence inspection |
| References | Link | Unit, external, and existing-note references; inspect/remove links |
| Unit properties | SlidersHorizontal | Literal label, optional title, movement, removal |
| Footnotes | Superscript | New note, reference existing note, edit existing notes |
| Undo / Redo | Undo2 / Redo2 | Transaction history, with disabled empty states |

Menus retain text labels. Tooltips appear on hover and keyboard focus; icon buttons have accessible names. Do not rely on hover for essential actions. Destructive actions remain explicitly named in the relevant menu/editor.

Keep settings and editor-view controls discoverable without turning the ordinary toolbar into a configuration dashboard. Provide keyboard access to each menu and a clear Escape/focus-return behavior.

## 5. Sticky behavior and document width

The context/formatting bar sticks to the top of the active document scroll area. It does not require returning to the beginning of the constitution. It remains usable when navigation is hidden, the document is long, or focus is near Article 20.

Account for the application header, browser zoom, narrow windows, and touch targets. The toolbar may reflow into two compact rows on a narrow touch screen. It must not overlap text or steal the active selection. Its menus open over the document without pushing every paragraph downward.

The test mock includes a long-document view and examples through Article 20 so this behavior can be tested directly.

## 6. Continuous writing and automatic sentence nodes

### Eligibility and configuration

Reuse the existing outline/segmentation model where possible. A setting equivalent to “Automatically create sentence nodes” maps to sentence segmentation on the configured leaf level. Add a delimiter list to the versioned level settings.

- Default delimiters: period, exclamation mark, question mark.
- Allow configurable punctuation, including suitable non-Latin delimiters.
- Define and validate the representation of multi-character delimiters.
- Reject an empty/invalid configuration when automatic creation is enabled.
- Reject automatic sentence creation on a level that allows child nodes or requires a manually authored label or title. Existing pinned settings remain readable; automatic creation is unavailable there until the metadata policy is made compatible.
- Hide or disable irrelevant controls with a short explanation.
- Never infer behavior from a kind code or English label alone.

Article and Paragraph remain unaffected while they have child levels. A configured leaf with another display label can receive the behavior.

### Typing behavior

In flowing mode, the user types in a continuous paragraph canvas. Sentence nodes are maintained underneath it; typing a new sentence does not require clicking Add. Caret position, selection, scroll, and active formatting survive boundary updates.

Treat an unfinished next sentence as editor state until it contains meaningful content. Do not persist an empty legal sentence, empty required label, or extra punctuation merely to show a place to type.

Boundary handling must consider:

- abbreviations and initials;
- decimals and digit punctuation;
- URLs and email addresses;
- repeated punctuation and ellipses;
- closing quotation marks and brackets;
- whitespace and line breaks;
- IME/composition input;
- paste and replacement in the middle of existing text;
- configurable Unicode delimiters;
- removal of a delimiter and joining a previously split sentence.

Boundary suggestions remain manually adjustable. Preserve exact text and whitespace. Never silently move child units or turn an article heading into a sentence.

Implement automatic operations as transactions with stable identities. Reuse unchanged units; assign new identities only to genuinely new units. Preserve or explicitly remap formatting, references, note markers, and review identity through splitting and merging.

### Presentation

Use the constitution’s existing presentation setting as the source of truth:

- **Flowing:** sentence nodes form continuous paragraph text.
- **Line by line:** each sentence starts a new visual line.

Switching presentation must not insert newlines into the legal source, change wording, recreate node identities, or alter ordering. The dashed-box toggle is a temporary view control available only in flowing mode.

## 7. Inline text formatting

Provide bold, italic, underline, and strikethrough as direct toolbar actions. They work on a text selection and as active marks for continued typing. Preserve selection when clicking a toolbar button. Show pressed/mixed states appropriately.

Persist structured marks over exact text ranges rather than arbitrary HTML. Extend shared content/write/import/draft contracts consistently. Validate mark types, ranges, overlaps, normalization, and limits. Allow combinations such as bold+italic.

Formatting is presentation data. Strikethrough must not be mistaken for a legal repeal or a review diff. Underline must not make ordinary text indistinguishable from an actionable reference.

Formatting survives:

- saving and reopening;
- automatic/manual split and merge;
- undo and redo;
- ordered import/export;
- review and comparison;
- publication to immutable successors;
- public reading, preview, and printing.

Use a structured production editor core with reliable selection/composition support. The mock demonstrates interaction and data expectations; prototype DOM commands are not a production persistence strategy.

## 8. Footnotes and references

### Data rule

Canonical constitution content has body material followed by a final notes section. No constitutional unit or substantive body entry may follow the first endnote. The validator operates across the entire constitution version, including nested nodes and multiple roots.

Inline references are separate from note bodies. Preserve their stable identities, authored marker labels, and exact anchor positions. Multiple references may point to one note. A note’s label need not be globally generated Arabic numbering.

Use the owning Content service as the authoritative write boundary. Share a deterministic validation routine with import and draft adapters so early feedback and final enforcement agree. Do not implement this rule only in CSS or one upload form.

Existing ordered storage may be retained if it can express the invariant unambiguously. The editor/view model should expose notes as a constitution-level collection. Any required persistence change uses a new migration; applied migrations and published snapshots remain unchanged.

### Editor flow

1. Place the cursor or select the relevant text.
2. Choose Footnotes → New footnote….
3. Enter the literal label and note text in the endnotes area.
4. Review the marker position; advanced reference-position controls remain collapsed.
5. Confirm with Insert marker and note.

Clicking Edit on a note replaces that note’s text with an inline editor at its current location. Apply or Cancel returns to the ordinary note row. Removing a note handles all of its references explicitly and is undoable in a draft.

The editor offers no paragraph/article placement choices for note bodies. Creating or moving constitutional content must keep notes at the end or produce a clear placement error before saving.

### Hover, focus, and navigation

Show the referenced note in a lightweight popover on hover and keyboard focus. Clicking or tapping a marker opens a bottom drawer containing the note, without changing the reading position. Close the drawer with ×, Escape, or a tap outside. Include a “Go to footnote” link that explicitly closes the drawer and jumps to the actual note at the constitution’s end. Keep the endnote’s Edit action for editing its text in place. On phones, retain a small superscript numeral with a transparent touch target rather than applying full toolbar-button dimensions. Provide stable accessible relationships, usable contrast, and sensible positioning near viewport edges. Keep the existing real note destination and backlinks.

Resolve notes across roots: a marker in Article 1 must still work when its note is at the end after Article 20. Public readers, single-unit pages, preview, and review need the same version-pinned note index. Avoid loading a complete large constitution repeatedly for each marker.

## 9. All import and write paths

Inventory every route into constitution content before implementation:

- full ordered API writes;
- ordinary JSON import jobs;
- setup-confirmed and scoped/MCP staging;
- batches, resumable/chunked uploads, and preparation;
- legacy article/tree import adapters;
- fixtures/prepopulation and maintenance import scripts;
- editor draft saves and publication;
- revision reuse, successor copying, and publication retry/sealing paths.

All recognized structured notes must reach the same authoritative placement validation. Legacy/plain text does not become a structured footnote merely because it contains a number or asterisk; explicit conversion must be deliberate.

Invalid placement receives a stable error code and actionable path/identity. Validate before public visibility; transaction rollback must prevent partial writes. Revalidate the assembled upload, not only individual chunks. Retry/receipt paths must not bypass a newer invariant.

Do not silently rewrite an already published constitution. Historical reads remain available. Corrections use the normal reviewed successor workflow. If an existing draft/source uses the old layout, surface an explicit migration/correction step and preserve note text, labels, identities, and links.

## 10. Change overview and review

Keep a session-wide Changes view grouped by article, paragraph, and affected item. Show exact before/after wording and formatting, note changes, references, and structural changes. Include removed units and unloaded branches.

Distinguish:

- Changed: a real difference from the pinned source.
- Unsaved: local changes not yet saved.
- Needs attention: validation problems or explicit reviewer feedback.

Each item jumps directly to the correct passage or inline note editor. Provide previous/next change navigation. Save, review, approval, and publication remain separate actions with their existing permissions and fresh-MFA requirements.

Do not treat a changed item as reviewed automatically. Preserve existing decision identity and stale-generation protection.

## 11. Undo and redo

Use transaction history covering text, formatting, automatic boundaries, structural operations, note bodies, marker positions, and links. Group typing sensibly; one automatic split should be reversible with its associated text/identity changes.

Undo creates a redo entry. Redo restores the exact operation. A new content edit after undo clears the redo branch. Disable and visually mute controls when their history is empty.

Support conventional keyboard shortcuts and retain document focus/scroll. Save status is independent of whether undo/redo is available. Global published configuration revisions are not silently undone as local text edits; configuration has its own explicit lifecycle.

## 12. Accessibility, cognitive load, and performance

- Keep optional UI closed by default.
- Use visible text in menus and accessible names for icons.
- Preserve focus after toolbar actions, typing, notes, and navigation.
- Avoid keyboard traps and hover-only functions.
- Keep touch targets usable and support 200% zoom without horizontal overflow.
- Use subtle selection/boundary treatment; do not color every sentence differently.
- Announce meaningful results without reading every keystroke or creating a large visible status area.
- Use a real reading preview without editor metadata.
- Preserve selection and undo when hiding navigation or changing view.
- Keep large trees lazy/paginated where appropriate; maintain a complete version-level note/change index.
- Separate composition input and transient sentence placeholders from persisted legal structure.

## 13. Implementation sequence

### Phase A — Prototype and test the interaction

Deliver the complete plan and an interactive mock covering the compact/sticky toolbar, hidden navigation, configured display, automatic sentences/delimiters, formatting, notes, hover/focus, and undo/redo. Gather user feedback before changing the application implementation.

### Phase B — Contract and validation foundation

Define the endnote invariant, mark ranges, level segmentation/delimiters, compatibility, and error codes. Implement shared validation plus Content authority tests. Confirm schema/migration needs from the actual repository.

### Phase C — Import coverage

Wire all listed ingestion/adaptation/preparation paths into validation. Add valid/invalid mixed-root and nested fixtures, chunk assembly tests, and rollback/publication tests.

### Phase D — Continuous editor and configuration

Build continuous editing on the existing ordered operations and pinned settings. Add leaf-only automatic boundaries, configurable delimiters, view-only presentation, and history behavior.

### Phase E — Toolbar, formatting, and notes

Implement the compact/sticky toolbar, all existing tool entry points, structured marks, endnote-only authoring, in-place note editing, global references, and accessible hover/focus popovers.

### Phase F — Review, reader, verification, and delivery

Complete change/review/reader/print behavior. Update Wiki sources. Run all changed-service tests, platform tests, gateway lint/build, focused browser journeys and accessibility checks. Deliver the verified branch/PR. Any sprint execution later follows the repository’s independent reviewer/verifier, CI, merge, Wiki, and Linear close-out rules.

## 14. Acceptance matrix

| Scenario | Required outcome |
|---|---|
| Type two sentences with automatic creation enabled | New sentence nodes appear; typing remains continuous |
| Disable automatic creation | Delimiters remain ordinary text |
| Configure a non-leaf level | Automatic sentence creation is unavailable and rejected by backend validation |
| Change delimiters | Only configured delimiters create boundaries |
| Type decimals/abbreviations/URLs | No destructive accidental splitting; manual correction remains possible |
| Switch flowing ↔ line-by-line | Display changes; source text and identities do not |
| Use boundary toggle | Boxes toggle only in flowing mode |
| Select words and apply B/I/U/S | Correct range changes and survives save/reopen |
| Automatically split formatted/referenced text | Marks and reference/note anchors remain attached correctly |
| Insert a footnote | Body goes to constitution end; reference stays at its selected position |
| Import a note before later body content | Every applicable path rejects it with an actionable placement error |
| Reuse/copy revisions containing invalid placement | Final validation still rejects the new write/publication |
| Hover/focus an early-article marker | Its endnote text is shown; navigation remains usable |
| Edit a footnote | The editor appears at the note’s location |
| Read Preview | No placement captions or editing instructions appear in the document |
| Hide/show navigation | Width is reclaimed without losing changes |
| Scroll/edit around Article 20 | Toolbar remains accessible |
| Undo, redo, then make a new edit | Exact restoration; new edit clears redo; empty histories are disabled |
| Narrow window, touch, keyboard, 200% zoom | Controls remain reachable without overlap or horizontal overflow |

## 15. Current repository and tracking findings

Content owns immutable ordered node/text revisions and snapshots. Editor owns draft operations and publication orchestration. Catalog owns versioned outline/settings revisions. Ingestion owns staging/validation/orchestration. Gateway owns presentation and client-side interaction; it has no database.

Content now validates the resolved constitution across all roots with shared OrderedContentRules. Import assembly and draft replay use the same endnote and reference rules. Historical reads retain their source content; new writes, reused revisions, sealing, and publication retries enforce the invariant. Structured marks use the existing rich-content JSON; Catalog migration V32 stores sentence delimiters with outline revisions.

Related completed work: VER-273, VER-274, and VER-275. A new follow-up issue could not be created because the Linear workspace has reached its free issue limit. Do not mark those completed issues reopened or claim that this new work is tracked/completed under them.

The implementation is on the compact editor feature branch. No deployment is part of this change. Local and CI acceptance evidence accompanies the pull request.

## 16. Prototype checks performed

- Continuous input created separate nodes for “Erster Satz. Zweiter Satz! Dritter Satz?” while retaining editor focus.
- A custom semicolon delimiter split “Eins; Zwei. Noch zwei; Drei” at semicolons, preserving the period inside the middle sentence.
- With automatic creation disabled, a new paragraph retained three punctuation-ended sentences in one node.
- “Dr. Meier misst 3.14 Meter. Fertig!” retained the abbreviation and decimal and produced the intended two completed sentences.
- Article-level automatic creation was disabled because Article has children.
- Line-by-line presentation used separate visual blocks and hid the boundary button; flowing presentation exposed it.
- All four formatting commands produced the expected semantic rendering. Undo and Redo restored the formatting.
- In the long-document view, the toolbar remained at the scroll viewport’s top after scrolling approximately 3,064 pixels to Article 20.
- Hiding navigation reclaimed 161 pixels in the tested desktop layout.
- Footnote insertion, literal-label editing, in-place editing, constitution-end display, and caption-free reading preview were exercised.
- The note preview appeared for a keyboard-focused marker and dismissed with Escape.

The narrow-viewport override did not resize the current in-app preview surface. Dedicated mobile/200%-zoom verification remains in the implementation acceptance work; it is not claimed as completed here.

## 17. Implementation locations

- Gateway StructuredEditor and ContinuousCanvas provide the compact toolbar, continuous editing, history, scoped loading, complete Preview, and in-place endnotes. ChangeOverview presents readable session-wide changes; EditorWorkspace remembers hidden navigation and discloses workflow details.
- Shared Footnotes and InlineText components provide exact range formatting, cross-root hover/focus previews, the dismissible drawer, destination links, and reader/print rendering.
- Platform OrderedContentRules validates endnote position, UTF-16 marks, and global reference targets. Content is the final authority, while Editor and Ingestion supply early feedback and final assembly/publication validation.
- Explicit split/merge operations retain rich ranges and lineage. A unit reference to split text follows its first part; a merge or an explicit replacement redirects targets to the surviving identity. Annotation anchors may expand to all split parts.
- Catalog stores sentenceDelimiters in V32 and immutable settings JSON. The strict existing MCP import transport carries these settings and text marks without adding a new service.
