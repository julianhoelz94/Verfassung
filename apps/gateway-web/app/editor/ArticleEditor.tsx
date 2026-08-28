'use client';

import { saveDraftAction } from './actions';

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
      <p>
        <label htmlFor="title">Title</label>
        <br />
        <input id="title" name="title" defaultValue={title} style={{ width: '100%', padding: 8 }} />
      </p>
      <p>
        <label htmlFor="body">Article text</label>
        <br />
        <textarea
          id="body"
          name="body"
          defaultValue={body}
          rows={18}
          style={{ width: '100%', padding: 12, fontFamily: 'Georgia, serif', fontSize: 16 }}
        />
      </p>
      <button type="submit">Save draft</button>
    </form>
  );
}
