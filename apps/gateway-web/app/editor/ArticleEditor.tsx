'use client';

import { T } from '../components/TranslationProvider';
import { ui } from '../../lib/messages';
import { Button, Input, TextArea } from '../components/ui';
import { Stack } from '../components/layout/Layout';
import { useEffect, useRef, type FormEvent } from 'react';
import { useDraftState } from './EditorDraftState';

type ArticleEditorProps = {
  sessionId: string;
  versionId: string;
  articleId: string;
  title: string;
  body: string;
  formId?: string;
};

export function ArticleEditor({
  sessionId,
  versionId,
  articleId,
  title,
  body,
  formId = 'draft-form',
}: ArticleEditorProps) {
  const { setDirty } = useDraftState();
  const unsaved = useRef(false);
  const saving = useRef(false);
  useEffect(() => () => setDirty(false), [setDirty]);
  useEffect(() => {
    const guard = (event: BeforeUnloadEvent) => {
      if (saving.current) { saving.current = false; return; }
      if (unsaved.current) { event.preventDefault(); event.returnValue = ''; }
    };
    window.addEventListener('beforeunload', guard);
    return () => window.removeEventListener('beforeunload', guard);
  }, []);
  return (
    <Stack as="form" id={formId} action="/editor/command" method="post" onSubmit={() => { saving.current = true; }} onChange={(event: FormEvent<HTMLFormElement>) => {
      const form = event.currentTarget;
      unsaved.current = (form.elements.namedItem('title') as HTMLInputElement).value !== title || (form.elements.namedItem('body') as HTMLTextAreaElement).value !== body;
      setDirty(unsaved.current);
    }}>
      <input type="hidden" name="command" value="save" />
      <input type="hidden" name="sessionId" value={sessionId} />
      <input type="hidden" name="versionId" value={versionId} />
      <input type="hidden" name="articleId" value={articleId} />
      <Input id="title" name="title" label={<T value={ui.attrs.editorArticleeditorInputLabelTitle} />} defaultValue={title} />
      <TextArea id="body" name="body" label={<T value={ui.attrs.editorArticleeditorTextAreaLabelArticleText} />} defaultValue={body} rows={18} className="constitution-body" />
      <div className="action-bar">
        <Button variant="primary"><T value={ui.editor.articleeditor.saveDraft} /></Button>
      </div>
    </Stack>
  );
}
