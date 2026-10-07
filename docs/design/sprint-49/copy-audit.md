# Sprint 49 copy and control audit (VER-249)

Reviewed the public reader, compare, search, timeline, account, editor, and constitution outline screens at phone, tablet, and desktop widths. These are the labels and behavior decisions used for this sprint.

| Screen | Finding | Resolution |
| --- | --- | --- |
| Country compare | The change status linked to its own heading fragment, making a static badge appear actionable. | Render the status as a badge. Keep the heading `id`, compare links, and change detail links. |
| Constitution outline | Kind name, label, and title toggles appeared usable when a running-text presentation or an editor policy made them ineffective. | Disable inactive controls, explain the prerequisite, and show the effective reader output in the preview and final review. Preserve valid settings when switching presentation modes. |
| Public reader and editor | Generic `Article` strings appeared for constitutions with a different configured level label. | Use the configured `displayLabel` in reader history/navigation and structured editor selection/navigation. Literal labels remain exactly as stored. |
| Editor landing | A version picker and manual session identifier made starting and resuming look like the same action. | Show only the signed-in user's open sessions, with country, constitution, version, work type, and last edit. New work begins from a selected constitution viewer. |
| Constitution viewer | There was no visible editing entry in the constitution context. | Add `Edit this constitution` for editor/admin roles, show existing owned sessions before explicit legal-change and transcription-correction choices, and explain a failed session lookup. |
| Account, search, timeline, home | Controls and nearby help or links had uneven spacing. | Keep related labels and help together; separate distinct actions and cards using shared spacing tokens. |

Verification includes browser journeys for role access, new versus existing sessions, more than 100 owned sessions, and unavailable session lookup; unit coverage for effective outline display; and responsive captures in `after/`. The labels are plain text or badge status when they do not navigate, and links or buttons when they do.
