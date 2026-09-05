'use client';

import { saveDraftAction } from './actions';
import { Button, Input, TextArea } from '../components/ui';

type ArticleEditorProps = {
  sessionId: string;
  versionId: string;
  articleId: string;
  title: string;
  body: string;
};

export function ArticleEditor({ sessionId, versionId, articleId, title, body }: ArticleEditorProps) {
  return (
    <form action={saveDraftAction}>
      <input type="hidden" name="sessionId" value={sessionId} />
      <input type="hidden" name="versionId" value={versionId} />
      <input type="hidden" name="articleId" value={articleId} />
      <Input id="title" name="title" label="Title" defaultValue={title} />
      <TextArea id="body" name="body" label="Article text" defaultValue={body} rows={18} className="constitution-body" />
      <Button variant="primary">Save draft</Button>
    </form>
  );
}
