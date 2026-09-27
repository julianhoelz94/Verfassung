# Ordered content traversal

Consumers must carry the selected version ID alongside logical, revision, and occurrence IDs. A revision may be shared by several versions; its occurrence and permalink belong to the selected version.

Walk each root and its content entries in stored order. A text entry contributes its exact stored text. A child contributes its recursively traversed entries at that position. Labels and titles are metadata and are not injected into body text. Never reconstruct order from a separate body and children projection when ordered content is available.

For plain text, skip empty fragments and concatenate adjacent text entries exactly, so text splitting and merging preserve output. At child-unit boundaries add one space only when neither boundary already has whitespace. Preserve all stored whitespace and punctuation. This contract applies to reader sentence groups, search bodies, comparison text, and amendment quotations. Platform `OrderedContentText` is the backend implementation; the gateway uses the same rule.

Compare logical identities across versions and revision identities for reuse. Occurrence IDs identify version-specific links, not semantic changes. Legacy article endpoints remain compatibility projections; generic unit routes use the outline root kind.

Generic unit responses mark backfilled legacy trees with `legacyIdentity: true`. Independently imported legacy versions may lack shared logical lineage. Reserve stable identity matches first, then pair unmatched legacy roots by literal label and descendants within matching hierarchy paths. Use this compatibility fallback only when both sides are legacy representations; canonical content keeps strict logical identity matching.
