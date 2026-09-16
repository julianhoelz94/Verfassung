'use client';

import { Button, Input, TextArea } from '../components/ui';

type PublishFormProps = {
  sessionId: string;
  versionId: string;
  articleId: string;
  hopKind: 'legal' | 'editorial_correction';
  status: string;
  canEdit: boolean;
  canPublish: boolean;
  record?: { title: string; comment: string; documents: { url?: string; label?: string }[] } | null;
  comment?: string | null;
};

export function PublishForm({ sessionId, versionId, articleId, hopKind, status, canEdit, canPublish, record, comment }: PublishFormProps) {
  const fields = <>
    <input type="hidden" name="sessionId" value={sessionId} />
    <input type="hidden" name="versionId" value={versionId} />
    <input type="hidden" name="articleId" value={articleId} />
    <input type="hidden" name="hopKind" value={hopKind} />
  </>;
  const ready = hopKind === 'legal' ? Boolean(record) : Boolean(comment);
  return (
    <section className="stack" aria-label={hopKind === 'legal' ? 'Change record' : 'Transcription comment'}>
      <h3>{hopKind === 'legal' ? 'Change record' : 'Transcription comment'}</h3>
      {status === 'open' && canEdit ? (
        <form action="/editor/command" method="post" className="stack">
          <input type="hidden" name="command" value="details" />
          {fields}
          {hopKind === 'legal' ? <>
            <Input id="recordTitle" name="recordTitle" label="Title" defaultValue={record?.title ?? ''} required />
            <TextArea id="recordComment" name="recordComment" label="Comment" defaultValue={record?.comment ?? ''} required rows={3} />
            <Input id="documentUrl" name="documentUrl" label="Document URL" defaultValue={record?.documents[0]?.url ?? ''} required type="url" />
            <Input id="documentLabel" name="documentLabel" label="Document label" defaultValue={record?.documents[0]?.label ?? ''} />
          </> : (
            <TextArea id="comment" name="comment" label="What was corrected in this transcription?" defaultValue={comment ?? ''} required rows={3} />
          )}
          <Button>Save {hopKind === 'legal' ? 'change record' : 'comment'}</Button>
        </form>
      ) : (
        hopKind === 'legal' && record ? (
          <div className="stack">
            <p><strong>{record.title}</strong></p>
            <p>{record.comment}</p>
            {record.documents.length > 0 ? (
              <ul>
                {record.documents.map((document, index) => (
                  <li key={`${document.url ?? document.label ?? 'document'}-${index}`}>
                    {document.url ? (
                      <a href={document.url} rel="noreferrer">
                        {document.label ?? document.url}
                      </a>
                    ) : (
                      document.label ?? 'Archived document'
                    )}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : (
          <p className="muted">{comment ?? 'No comment saved.'}</p>
        )
      )}
      {status === 'approved' && canPublish ? (
        <form action="/editor/command" method="post" className="stack">
          <input type="hidden" name="command" value="publish" />
          {fields}
          <Button variant="primary" disabled={!ready}>
            {hopKind === 'legal' ? 'Publish new legal version' : 'Publish transcription'}
          </Button>
        </form>
      ) : null}
    </section>
  );
}
