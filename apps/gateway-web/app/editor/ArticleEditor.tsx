'use client';

import { T } from '../components/TranslationProvider';
import { ui } from '../../lib/messages';
import { Button, Input, TextArea } from '../components/ui';
import { Stack } from '../components/layout/Layout';

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
  return (
    <Stack as="form" id={formId} action="/editor/command" method="post">
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
