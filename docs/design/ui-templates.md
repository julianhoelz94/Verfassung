# UI templates and spacing

The gateway uses React components and vanilla CSS Modules. No styling or template framework is required. Route components retain data loading and actions; templates own presentation and remain compatible with server-rendered public content and client editor components.

## Choose a page template

Import from `apps/gateway-web/app/components/layout/templates.tsx`.

| Template | Use for | Slots |
| --- | --- | --- |
| `FocusedPage` | Authentication, verification, consent and simple status pages | Header, notices, content |
| `SettingsPage` | Account, setup, site configuration | Header, notices, navigation, content |
| `CollectionPage` | Discovery, queues, document lists, search and history | Header, notices, content |
| `ReaderPage` | Legal text, contextual articles, comparison and source documents | Header, notices, content |
| `WorkspacePage` | Editing, review, import and constitution configuration | Header, notices, content |

`width="reading"` limits the page to the reading measure; `width="content"` uses the site maximum. Settings and collection/workspace templates default to content width. Focused and reader templates default to reading width. Full constitution readers use content width and place a `ReaderLayout` inside the existing shared renderer. `WorkspaceLayout` owns editor columns; its amendment variant stacks on phones and places revision history alongside the form on desktop. `FilterLayout` owns the responsive filter/results split. Each page has one `main#main-content`, one page heading and the existing skip-link target.

```tsx
<SettingsPage
  header={<PageHeader title="Account" />}
  navigation={<nav aria-label="On this page"><a href="#preferences">Preferences</a></nav>}
  notices={saved ? <Alert tone="success">Saved.</Alert> : null}
>
  <Card id="preferences">
    <Section title="Preferences">
      <Stack as="form" action={savePreferences}>
        <Input name="displayName" label="Display name" help="Shown beside your contributions." />
        <Button>Save</Button>
      </Stack>
    </Section>
  </Card>
</SettingsPage>
```

Use existing localized messages for product text. Navigation is a slot so route-specific permissions, destinations and translated landmark labels stay with their owner. Empty notices do not reserve vertical space. Templates do not implement routing lifecycle behavior and are unrelated to Next.js `template.tsx` files.

## Spacing ownership

The global stylesheet is in the `base` cascade layer; scoped structural layout rules take precedence over base margins regardless of stylesheet order. Typography defaults stay in the base layer at low specificity so the hero heading, legal-text editing font and larger MFA code font retain their intended variants. Print-specific module rules preserve hidden action groups.

Runtime tokens live only in `apps/gateway-web/app/styles/tokens.css`, imported by the root layout. The historical prototype token file imports that source instead of copying it.

The shared visual language follows the constitution viewer: warm near-white paper, white surfaces, muted green accents, restrained shadows and regular-weight Georgia headings. Constitutional text uses the same serif face at `1.0625rem / 1.85`; navigation, forms, metadata and actions retain the system sans-serif face. `--font-heading`, `--weight-heading` and `--weight-ui-emphasis` keep page headings and interface emphasis consistent. Authored bold text retains its semantic emphasis. Status and diff colors use subdued but distinct foreground/background pairs, and keyboard focus keeps a contrasting amber outline.

| Token / layout gap | Value | Relationship |
| --- | --- | --- |
| `--gap-related` / `related` | 8px | Label, control, help, error |
| `--gap-control` / `control` | 12px | Peer controls and wrapping actions |
| `--gap-field` / `field` | 16px | Separate fields and panel content |
| `--gap-card` / `card` | 24px | Cards and related subsections |
| `--gap-section` / `section` | 32px | Major sections |

Use `Stack`, `Inline`, `Grid` and `Section` from `components/layout/Layout.tsx`. `Stack` defaults to field spacing; `Inline` wraps at control spacing; `Grid` defaults to three columns on desktop, two on tablet and one on phones. Set `columns={2}` for a two-column maximum. Keep `as` set to the correct semantic element (`form`, `fieldset`, `ol`, `ul`, etc.). For focus/measurement refs, pass `elementRef` to the native element.

The parent layout owns **sibling gaps** and resets its direct children's vertical margins. Cards/panels own **internal padding**, with no external margin. Fields own **label/control/help/error spacing**, with no external margin. An outer section can wrap a group of cards in `Stack gap="card"`. Avoid a second margin for a relationship already owned by `gap`. Do not apply these resets within authored constitution text; the shared renderer retains its legal typography and nested structure.

`Input`, `Select` and `TextArea` accept `help` and `error`, associate them with the native control and preserve existing `aria-describedby` references. Error content marks the field invalid. Prefer an explicit id or a unique field name; a generated id supports unnamed controls. Fields remain native controls with visible keyboard focus and the existing 44px target. Group native labels and controls in a shared field rather than making them separate items in a form stack.

Alignment is part of the layout contract. `Inline align="end"` aligns form controls along their bottom edge; `start`, `center` and `baseline` cover other action groups. Card grids stretch their siblings to the same row height. `Grid variant="form" columns={2}` uses shared label/control/message tracks so a wrapped label or help message does not move one input out of line with its neighbor. Page-header actions align at the top on desktop and move to a separate row on smaller screens. Template content and its cards retain shared left/right edges.

## Responsive behavior and verification

Use the established 640px and 1024px breakpoints. Keep `min-width: 0`, flexible tracks and wrapping action rows so long German text and nested editors reflow. Add an exception only for a distinct content requirement, scoped to that component.

Run gateway tests, typecheck, lint, build and the browser suite. `e2e/templates.spec.ts` verifies that one changed gap token produces the same measured gap across the three settings templates at 320/820/1440px in both languages. `ui-review.spec.ts` visits all route/state fixtures, checks overflow/landmarks/axe, and captures EN/DE at 390/820/1440px. Inspect snapshot changes using the pinned Playwright Linux image before committing baselines. A successful screenshot alone does not verify save/review/publication behavior; retain the existing journey and real-stack checks.
