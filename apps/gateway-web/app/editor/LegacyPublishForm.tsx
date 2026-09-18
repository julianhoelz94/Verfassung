'use client';

import { Button, Input, TextArea } from '../components/ui';

export function LegacyPublishForm({ sessionId, versionId, articleId }: { sessionId: string; versionId: string; articleId: string }) {
  const fields = <>
    <input type="hidden" name="sessionId" value={sessionId} />
    <input type="hidden" name="versionId" value={versionId} />
    <input type="hidden" name="articleId" value={articleId} />
  </>;
  return <section className="stack" aria-label="Existing session publish">
    <p className="muted">This session predates separate publish jobs. Choose the appropriate action for its approved changes.</p>
    <form action="/editor/command" method="post" className="stack">
      <input type="hidden" name="command" value="publish" />
      {fields}
      <input type="hidden" name="hopKind" value="editorial_correction" />
      <TextArea id="legacyComment" name="comment" label="Transcription comment" required rows={3} />
      <Button>Publish transcription</Button>
    </form>
    <form action="/editor/command" method="post" className="stack">
      <input type="hidden" name="command" value="publish" />
      {fields}
      <input type="hidden" name="hopKind" value="legal" />
      <Input id="legacyRecordTitle" name="recordTitle" label="Change record title" required />
      <TextArea id="legacyRecordComment" name="recordComment" label="Change record comment" required rows={3} />
      <Input id="legacyDocumentUrl" name="documentUrl" label="Document URL" required type="url" />
      <Button>Publish new legal version</Button>
    </form>
  </section>;
}
