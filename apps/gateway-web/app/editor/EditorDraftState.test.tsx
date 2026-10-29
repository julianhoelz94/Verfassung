import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { fireEvent } from '@testing-library/dom';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ContentOutline } from '../../lib/api';
import type { DraftNode, StructuredPreview } from '../../lib/structured-editor';
import { TranslationProvider } from '../components/TranslationProvider';
import { ArticleEditor } from './ArticleEditor';
import { EditorDraftState, SubmitReviewButton } from './EditorDraftState';
import { PublishForm } from './PublishForm';
import { StructuredEditor } from './StructuredEditor';

const article: DraftNode = {
  logicalId: 'article', revisionId: 'article-revision', occurrenceId: 'article-occurrence', kind: 'article', label: '1', title: 'Rights',
  content: [{ type: 'text', logicalId: 'text', revisionId: 'text-revision', text: 'Original wording.' }],
};
const preview: StructuredPreview = {
  sessionId: 'session', sourceVersionId: 'source', sourceGeneration: 1, settingsRevisionId: 'settings', generation: 0,
  sourceRoots: [article], roots: [article], operations: [],
};
const outline: ContentOutline = { kinds: [{
  kindCode: 'article', displayLabel: 'Article', sortOrder: 0, mayHoldText: true, mayHoldChildren: false,
  allowedChildKinds: [], presentation: 'section', showLabel: true, showTitle: true, showKind: true,
  titlePolicy: 'optional', labelPolicy: 'optional', segmentation: 'plain',
}] };
type EditorKind = 'structured' | 'article';

function Workspace({ kind, showText = true, showDetails = true, legal = false }: {
  kind: EditorKind; showText?: boolean; showDetails?: boolean; legal?: boolean;
}) {
  return <TranslationProvider locale="en"><EditorDraftState>
    {showText ? kind === 'structured'
      ? <StructuredEditor preview={preview} outline={outline} rootId="article" versionId="source" articleId="article-occurrence" constitutionId="constitution" editable />
      : <ArticleEditor sessionId="session" versionId="source" articleId="article-occurrence" title="Rights" body="Original wording." />
      : null}
    {showDetails ? <PublishForm sessionId="session" versionId="source" articleId="article-occurrence"
      hopKind={legal ? 'legal' : 'editorial_correction'} status="open" canEdit canPublish={false}
      comment="Existing explanation." structuredDraft={legal ? preview : undefined} outline={outline}
      record={legal ? { title: 'Law', comment: 'Existing explanation.', documents: [{ url: 'https://example.test/law' }], changes: [] } : undefined} /> : null}
    <SubmitReviewButton disabled={false} />
  </EditorDraftState></TranslationProvider>;
}

describe('independent text and details unsaved guards', () => {
  let host: HTMLDivElement;
  let root: Root;
  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    window.history.replaceState(null, '', '/editor');
    Object.defineProperty(Range.prototype, 'getClientRects', { configurable: true, value: () => [] });
    Object.defineProperty(Range.prototype, 'getBoundingClientRect', { configurable: true, value: () => new DOMRect() });
    host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host);
  });
  afterEach(async () => { await act(async () => root.unmount()); host.remove(); });

  async function render(kind: EditorKind, options: { showText?: boolean; showDetails?: boolean; legal?: boolean } = {}) {
    await act(async () => root.render(<Workspace kind={kind} {...options} />));
  }
  function textInput() { return host.querySelector<HTMLElement>('#draft-form [role="textbox"], #draft-form textarea')!; }
  function textValue() {
    const input = textInput();
    if (input instanceof HTMLTextAreaElement) return input.value;
    const copy = input.cloneNode(true) as HTMLElement;
    copy.querySelectorAll('button, [contenteditable="false"]').forEach(element => element.remove());
    return copy.textContent;
  }
  function detailsInput() { return host.querySelector<HTMLTextAreaElement>('#editor-change-record textarea')!; }
  function submitReview() { return [...host.querySelectorAll('button')].find(button => button.textContent === 'Submit for review')!; }
  function blockers() { return [...host.querySelectorAll('#submit-review-help li')]; }
  async function change(field: HTMLElement, value: string) {
    await act(async () => {
      if (field.getAttribute('role') === 'textbox') {
        field.focus();
        field.querySelector('[data-unit]')!.textContent = value;
        fireEvent.input(field);
        await new Promise(resolve => setTimeout(resolve, 0));
      } else fireEvent.change(field, { target: { value } });
    });
  }
  async function submit(selector: string) {
    // Simulate the form handler without submitting a POST or navigating in jsdom.
    await act(async () => fireEvent.submit(host.querySelector<HTMLFormElement>(selector)!));
  }
  function navigationBlocked() {
    const event = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(event);
    return event.defaultPrevented;
  }

  for (const kind of ['structured', 'article'] as const) {
    it(`${kind} text and explanation edits create separate review blockers`, async () => {
      await render(kind);
      expect(submitReview().disabled).toBe(false);
      expect(navigationBlocked()).toBe(false);
      await change(detailsInput(), 'Unsaved explanation.');
      expect(submitReview().disabled).toBe(true);
      expect(blockers()).toHaveLength(1);
      expect(blockers()[0].querySelector('a')?.getAttribute('href')).toBe('#editor-change-record');
      expect(navigationBlocked()).toBe(true);

      await change(textInput(), 'Unsaved wording.');
      expect(blockers()).toHaveLength(2);
      if (kind === 'structured') {
        await act(async () => host.querySelector<HTMLButtonElement>('button[aria-label="Undo"]')!.click());
      } else {
        await change(textInput(), 'Original wording.');
      }
      expect(blockers()).toHaveLength(1);
      expect(blockers()[0].querySelector('a')?.getAttribute('href')).toBe('#editor-change-record');
      expect(submitReview().disabled).toBe(true);
      expect(navigationBlocked()).toBe(true);
    });

    for (const saving of ['text', 'details'] as const) {
      it(`${kind} keeps ${saving} protected after its save navigation is cancelled by the other unsaved form`, async () => {
        await render(kind);
        await change(textInput(), 'Unsaved wording.');
        await change(detailsInput(), 'Unsaved explanation.');
        await submit(saving === 'text' ? '#draft-form' : '#editor-change-record form');
        expect(navigationBlocked()).toBe(true);
        expect(textValue()).toBe('Unsaved wording.');
        expect(detailsInput().value).toBe('Unsaved explanation.');
        expect(submitReview().disabled).toBe(true);

        // Isolate the saving form after the blocked navigation: its guard must
        // have rearmed, independently of the other form's guard or dirty state.
        await render(kind, { showText: saving === 'text', showDetails: saving === 'details' });
        expect(navigationBlocked()).toBe(true);
        expect(blockers()).toHaveLength(1);
        expect(submitReview().disabled).toBe(true);

        await submit(saving === 'text' ? '#draft-form' : '#editor-change-record form');
        expect(navigationBlocked()).toBe(false);
      });
    }
  }

  it('searching for a passage does not mark the legal change record as unsaved', async () => {
    await render('structured', { legal: true, showText: false });
    const search = host.querySelector<HTMLInputElement>('#publish-0-before-search')!;
    await change(search, 'Rights');
    expect(submitReview().disabled).toBe(false);
    expect(blockers()).toHaveLength(0);
    expect(navigationBlocked()).toBe(false);

    const title = host.querySelector<HTMLInputElement>('#recordTitle')!;
    await change(title, 'Updated legal title');
    expect(submitReview().disabled).toBe(true);
    expect(blockers()).toHaveLength(1);
    expect(navigationBlocked()).toBe(true);
  });
});
