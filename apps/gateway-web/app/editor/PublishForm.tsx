'use client';

import { Button, Input, TextArea } from '../components/ui';
import { publishAction, savePublishDetailsAction } from './actions';

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
        <form action={savePublishDetailsAction} className="stack">
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
        <p className="muted">{hopKind === 'legal' ? record?.title ?? 'No change record saved.' : comment ?? 'No comment saved.'}</p>
      )}
      {status === 'approved' && canPublish ? (
        <form action={publishAction} className="stack">
          {fields}
          <Button variant="primary" disabled={!ready}>
            {hopKind === 'legal' ? 'Publish new legal version' : 'Publish transcription'}
          </Button>
        </form>
      ) : null}
    </section>
  );
}
