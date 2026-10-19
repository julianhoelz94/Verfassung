'use client';

import { T, useTranslation } from '../components/TranslationProvider';
import { ui } from '../../lib/messages';
import { Button, Input, TextArea } from '../components/ui';

export function LegacyPublishForm({ sessionId, versionId, articleId }: { sessionId: string; versionId: string; articleId: string }) {
  const t = useTranslation();
  const fields = <>
    <input type="hidden" name="sessionId" value={sessionId} />
    <input type="hidden" name="versionId" value={versionId} />
    <input type="hidden" name="articleId" value={articleId} />
  </>;
  return <section className="stack" aria-label={t(ui.accessibility.existingSessionPublish)}>
    <p className="muted"><T value={ui.editor.legacypublishform.thisSessionPredatesSeparatePublishJobsChoose} /></p>
    <form action="/editor/command" method="post" className="stack">
      <input type="hidden" name="command" value="publish" />
      {fields}
      <input type="hidden" name="hopKind" value="editorial_correction" />
      <TextArea id="legacyComment" name="comment" label={<T value={ui.attrs.editorLegacypublishformTextAreaLabelTranscriptionComment} />} required rows={3} />
      <Button><T value={ui.editor.legacypublishform.publishTranscription} /></Button>
    </form>
    <form action="/editor/command" method="post" className="stack">
      <input type="hidden" name="command" value="publish" />
      {fields}
      <input type="hidden" name="hopKind" value="legal" />
      <Input id="legacyRecordTitle" name="recordTitle" label={<T value={ui.attrs.editorLegacypublishformInputLabelChangeRecord} />} required />
      <TextArea id="legacyRecordComment" name="recordComment" label={<T value={ui.attrs.editorLegacypublishformTextAreaLabelChangeRecord} />} required rows={3} />
      <Input id="legacyDocumentUrl" name="documentUrl" label={<T value={ui.attrs.editorLegacypublishformInputLabelDocumentURL} />} required type="url" />
      <Button><T value={ui.editor.legacypublishform.publishNewLegalVersion} /></Button>
    </form>
  </section>;
}
