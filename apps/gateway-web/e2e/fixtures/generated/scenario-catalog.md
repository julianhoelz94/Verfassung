# Fixture scenario catalog

Run prepopulate with --profile extended (the local default) or --profile scale.
Resolved links are written to .runtime/scenario-guide.md after upload.

| Scenario | Role | Action | Expected result |
| --- | --- | --- | --- |
| reader-lab | viewer | Open both articles, follow the two [a] markers, inspect the table and compare the versions. | Mixed roots, skipped levels, interleaved text, literal labels and structural moves survive publication. |
| history-lab | viewer | Open the original and both corrections, then compare with the next legal version. | Old snapshots retain their text; corrections share one legal identity. |
| editor-draft | editor | Open the saved session and continue its editorial workflow. | The session begins in draft; later manual progress is preserved. |
| editor-review | reviewer | Open the saved session and continue its editorial workflow. | The session begins in review; later manual progress is preserved. |
| editor-approved | publisher | Open the saved session and continue its editorial workflow. | The session begins in approved; later manual progress is preserved. |
| editor-published | editor | Open the saved session and continue its editorial workflow. | The session begins in published; later manual progress is preserved. |
| editor-archived | editor | Open the saved session and continue its editorial workflow. | The session begins in archived; later manual progress is preserved. |
| source-returned | editor | Read the reviewer feedback, revise the source description and submit it again. | The reason and review history remain separate from constitutional text. |
| import-outline | editor | Inspect the import preview, structure and review decision. | The import starts at outline; unpublished text is private. |
| import-review | reviewer | Inspect the import preview, structure and review decision. | The import starts at review; unpublished text is private. |
| import-approved | publisher | Inspect the import preview, structure and review decision. | The import starts at approved; unpublished text is private. |
| import-rejected | editor | Inspect the import preview, structure and review decision. | The import starts at rejected; unpublished text is private. |
| setup-proposal | admin | Review the representative sample and confirm the structure. | Confirmation enables upload without publishing constitutional text. |
| amendment-review | reviewer | Inspect exact affected passages, diff decisions and revision history. | The legal record is review; published evidence retains exact snapshot pins. |
| amendment-published | publisher | Inspect exact affected passages, diff decisions and revision history. | The legal record is published; published evidence retains exact snapshot pins. |
| amendment-withdrawn | publisher | Inspect exact affected passages, diff decisions and revision history. | The legal record is withdrawn; published evidence retains exact snapshot pins. |
| amendment-stale | publisher | Inspect exact affected passages, diff decisions and revision history. | The legal record is stale; published evidence retains exact snapshot pins. |
| documents-context | editor | Download source files, inspect their revisions and open the unpublished context draft. | Published context, document revisions and legal text have independent histories. |
| historical-region | viewer | Browse the historical jurisdiction, annotations, lifecycle and legacy link. | Unknown dates stay unknown; source wording and literal labels remain intact. |
| curated-comparison | viewer | Select each topic and inspect its authored correspondences. | A missing counterpart is explicit and columns pin different constitutions. |
| search-pagination | viewer | Search Explorationneedle, paginate, then filter to the German version. | Results preserve their jurisdiction and exact version context. |
| scale-pagination | viewer | Read and search provisions beyond the first 200. | Upload and verification follow every page without truncation. |
