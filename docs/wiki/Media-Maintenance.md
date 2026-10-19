# Wiki illustrations and videos

**All screenshots and recordings are generated in CI after a PR merges into main.** Do not capture or replace documentation screenshots from a developer's local stack. PR checks validate the guides and scripts without publishing or updating images.

## How publication works

1. The [merged-PR workflow](https://github.com/julianhoelz94/Verfassung/blob/main/.github/workflows/wiki-videos.yml) checks out the merge commit and starts a disposable full stack in CI.
2. Real API fixtures are uploaded and read back. The documentation journey captures 18 illustrations and six clips in English/German.
3. Media validation checks PNG dimensions, clip duration/resolution and full MP4 decoding. A Chromium check plays all six clips and verifies the player fits desktop and phone widths without downloads.
4. The player is deployed to GitHub Pages. Only then are Wiki pages, inline screenshots and fresh clips published together.
5. Verify the workflow, public Wiki images and browser playback before recording completion.

The Wiki uses normal image embeds backed by its own media directory. The player provides native play/pause, seeking, playback speed and fullscreen controls. Video links open that player rather than a raw WebM download. Existing raw WebM addresses remain available for compatibility.

## Sources

| File | Purpose |
| --- | --- |
| `apps/gateway-web/e2e/full/wiki-recording.spec.ts` | Real public, account, administrator and editorial journeys |
| `apps/gateway-web/e2e/full/wiki-presentation.ts` | Recording-only cursor, click highlights, typing and reading pauses |
| `apps/gateway-web/playwright.wiki-recording.config.js` | Serial, no-retry capture; no traces or automatic failure screenshots |
| `scripts/check-wiki-docs.py` | Navigation, alt text and illustration inventory checks |
| `scripts/prepare-wiki-media.py` | Validate capture files, encode H.264 MP4 and build the player |
| `scripts/check-wiki-player.mjs` | Browser playback and responsive checks without screenshots |

Capture resolution is 1280 × 900. Captions remain visible for at least four seconds, targets are highlighted before a click, cursor movement is animated and example text is entered progressively. Screenshots hide recording decorations; their Wiki captions and alt text explain the task.

Authentication happens before each recording. CI uses fictional seed accounts and data. Sensitive credential/code inputs are blurred; do not add real accounts, traces, setup secrets or recovery codes to media.

## Update or repair a capture

Update the journey, labels and guide together. Keep image names synchronized with the inventory in `prepare-wiki-media.py`; `check-wiki-docs.py` rejects undeclared or unused illustrations. Use meaningful state assertions before capture, not timing sleeps as readiness checks. Viewing pauses are intentional presentation time.

A failed capture, encoding or playback check blocks publication. Correct the source in a PR and merge it; CI then regenerates the complete media set. A rerun of a failed merged-PR workflow uses that merge's source and does not require a local capture. GitHub Pages must be configured for GitHub Actions; its hosting is only for documentation media, separate from application CD.

[[Development and operations|Technical-Development]] · [[Documentation home|Home]]
