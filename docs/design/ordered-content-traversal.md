# Ordered content traversal

Consumers must carry the selected version ID alongside logical, revision, and occurrence IDs. A revision may be shared by several versions; its occurrence and permalink belong to the selected version.

Walk each root and its content entries in stored order. A text entry contributes its exact stored text. A child contributes its recursively traversed entries at that position. Labels and titles are metadata and are not injected into body text. Never reconstruct order from a separate body and children projection when ordered content is available.

For plain text, skip empty fragments and add one space between nonempty fragments only when neither boundary already has whitespace. Preserve all stored whitespace and punctuation. This contract applies to reader sentence groups, search bodies, comparison text, and amendment quotations. Platform `OrderedContentText` is the backend implementation; the gateway uses the same rule.

Compare logical identities across versions and revision identities for reuse. Occurrence IDs identify version-specific links, not semantic changes. Legacy article endpoints remain compatibility projections; generic unit routes use the outline root kind.
