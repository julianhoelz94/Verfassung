---
name: verfassung-editorial-design
description: Redesign Constitution Atlas (Verfassung) pages using the constitution viewer and editor's muted editorial design, shared page templates, tokens, and components. Use for page redesigns, visual refreshes, and extensions to this repository's shared design system.
---

# Verfassung editorial design

## User preference

For future Constitution Atlas page redesigns, use the constitution viewer and compact editor as the established visual reference. Carry their elegance and interaction quality into the requested page. Template as much of the design as is sensible, and apply the relevant shared templates to all redesigned pages. Reuse should exist in the implementation, so a shared improvement reaches the pages that use it.

Treat this as the default design direction; an explicit new direction from the user takes precedence. Adapt the layout to the page's purpose while retaining the common visual language.

## Inspect the current source of truth

Follow the repository's `AGENTS.md`, then read `docs/CODEMAPS/INDEX.md`, its frontend map, and `docs/design/ui-templates.md`. Inspect the current viewer and editor in the running app when available. Current source and rendered behavior take precedence over old mocks, screenshots, and remembered values.

Paths below are relative to `apps/gateway-web/`; locate their current equivalents if they move.

| Shared concern | Starting point |
| --- | --- |
| Palette, type, spacing, radii, shadows, sizes | `app/styles/tokens.css`, `app/globals.css` |
| Page templates and responsive layout | `app/components/layout/templates.tsx`, `app/components/layout/Layout.tsx` |
| Headers, controls, fields, surfaces | `app/components/ui.tsx` and its shared CSS Modules |
| Legal document rendering and typography | `app/components/ConstitutionDocument.tsx`, `app/components/ConstitutionDocument.module.css`, `app/components/ConstitutionText.tsx` |
| Reading interactions | `app/components/VersionReader.tsx` and its reader, menu, details, comparison, and footnote components |
| Editing workspace and Preview | `app/editor/StructuredEditor.tsx`, `app/editor/EditorWorkspace.tsx`, `app/editor/compact-editor.module.css` |

## Preserve capability while simplifying

Before replacing a busy layout, map existing capabilities to their new entry points. Check representative entity variants as well as the first example: national, regional, and historical constitutions should retain the relevant reading, version-history, and comparison controls. Keep legitimate unavailable actions understandable rather than dropping them without explanation. Compactness should come from layout and progressive disclosure while tools remain discoverable.

Use labels that describe the action precisely, with visual affordances that match what clicking does. Keep correction rationale separate from the content being corrected. Consolidate narrative source fields when the user requests editorial freedom, while preserving fields with distinct domain meaning. Distinguish heading levels and remove redundant context or navigation that returns to the current location.

## Visual and interaction direction

- Use warm near-white paper, white surfaces, muted green accents, dark green ink, quiet secondary text, fine borders, and restrained shadows through the shared semantic tokens. Preserve clear focus and distinguishable status/error/diff states.
- Use regular-weight serif headings and serif document prose; use the system sans-serif for navigation, forms, actions, and metadata. Keep a comfortable reading measure and line height, aligned edges, and deliberate whitespace.
- Give the page's main task or content visual priority. Keep action groups and menus compact, separate distinct action families, and disclose secondary information through labelled panels or menus. Retain existing capabilities and make them discoverable.
- For long reading or working views, keep relevant tools and visible navigation accessible while scrolling. Coordinate sticky offsets, anchor scrolling, independently scrolling navigation, and drawer/menu placement. Choose these behaviors where they serve the page.
- Support narrow screens, long German labels, keyboard navigation, visible focus, and accessible control targets. Keep compact visual presentation compatible with usable touch targets.

## Make reuse concrete

Choose an existing `FocusedPage`, `SettingsPage`, `CollectionPage`, `ReaderPage`, or `WorkspacePage` where appropriate. The continuous reader has its own `VersionReader` composition; preserve that specialized layout. Compose with `PageHeader`, shared fields/surfaces, and `Stack`, `Inline`, `Grid`, and `Section` before introducing page-specific structure.

Extract repeated presentation into the smallest useful shared template or component, with slots or variants for real differences. Keep route-owned data loading, authorization, actions, and domain behavior with their owners. Keep genuinely unique layout local. Avoid a universal template with numerous unrelated options.

Own each design decision once: runtime tokens define visual values, templates define page structure, components define recurring controls, and local styles define exceptional needs. Parent layouts own sibling gaps; surfaces own internal padding; fields own label/control/help/error spacing. Remove superseded local rules when adopting the shared implementation. Avoid copied template markup, duplicated tokens, and page overrides that silently recreate a separate design system.

Apply relevant templates to every page redesigned in the request, and bring previously redesigned pages that share an affected pattern onto the same implementation where sensible. Check all consumers of changed shared pieces, including pages outside the immediate route. A distinct page purpose can justify a different template or variant. Keep a wider migration proportionate to the authorized task and report any remaining inconsistent consumers explicitly.

The public viewer and editor Preview must share document components and typography. Make document design changes at that shared layer and verify both hosts. Other page types inherit the common tokens and interface components without acquiring unnecessary reader-specific features.

Preserve authored text, labels, footnote marks, hierarchy, and source formatting. Keep existing routes, permalinks, permissions, and workflows working; a visual redesign does not authorize changing their meaning.

## Verify the result

A mock that claims an interaction should make it testable. After the user accepts a mock, carry the approved details into the running implementation, including contextual tools, in-place editing, and relevant configuration behavior. Reconcile parallel editor/viewer changes before claiming consistency.

Inspect the actual rendered page at desktop and narrow widths in English and German where supported. Exercise changed interactions and representative consumers of shared changes. For sticky tools or drawers, check behavior near the bottom of a long page and confirm targets remain visible. For shared document changes, compare the viewer and editor Preview.

Check that compact menus retain their action groups, controls align across shared hosts, mobile footnote markers remain proportionate, and sticky controls work near the bottom of long content. Avoid unnecessary nested scrolling in reading and Wiki views. When the user requests a screenshot of the current implementation, capture the running app and identify the environment; reconstructed illustrations only establish mock appearance.

Run the gateway's required lint/build checks and focused behavior or browser checks appropriate to the change. Report what shared templates/components were reused or improved, which redesigned pages use them, and what was verified. Do not claim consistency from compilation alone.
