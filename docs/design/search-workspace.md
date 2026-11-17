# Public Search workspace

The Search redesign uses the approved [interactive study](https://constitution-search-study.sillycurlew.chatgpt.site).
The study's sample records, demonstration reader and study controls are not application data.

The Search page loads the real service through search-data.ts. SearchWorkspace
composes the same WorkCollectionFrame, header, measured menu and context toggle
used by Editor and Imports. Its single search form replaces the duplicate
site-header search fields on /search. Query submission, filter normalization,
server pagination and error handling remain Search-owned.

Filters disclose country, exact jurisdiction, published snapshot and exact
recorded effective date. With JavaScript, changes update the canonical URL and
results immediately, resetting the offset; unsent query text is retained.
Without JavaScript, the same controls belong to the native GET form and have an
Apply filters button. Unknown pinned values stay visible and removable when
facets fail. Dates do not imply an as-of reconstruction, and missing result
dates are labelled explicitly.

The nonmodal passage preview is a bounded sticky pane on desktop and a bottom
pane on narrow screens. Its footer remains visible while authored content
scrolls. Escape closes it and restores the invoking focus. The preview loads
only on demand and cancels stale requests; its ten-entry cache stays in memory.
It uses ConstitutionDocument, ConstitutionText, FootnoteProvider and the existing
DOM-range highlighter, preserving source language, formatting and notes.
Search snippets remain escaped except for recognized mark tokens.

The /api/reader/search-preview route accepts bounded identifiers, requires the
exact published version and unit membership, and does not forward staff
credentials. It shares the /api/reader/* admission policy and returns private,
uncached responses. Cross-root notes load once from that same snapshot when
needed. Unavailable previews are distinct from unavailable search and empty results.

Result links preserve national article routes or exact jurisdiction fragments.
The preview opens the pinned continuous reader. A validated fromSearch parameter
adds Back to search results to the shared VersionReader. Only canonical /search
URLs with known, nonduplicated query fields are accepted. Per-tab session memory
restores the results page, unsent text, filter disclosure, preview, focus and
scroll; storage failures leave native navigation available. No server draft or
editorial workflow is involved.

Verification covers SSR scope and pagination, preview publication boundaries,
stale responses, cache/retry behavior, return URL validation and retained state.
Browser journeys exercise English and German at 320, 820 and 1440 pixels, axe,
the actual reader return, visible preview actions and native forms.
