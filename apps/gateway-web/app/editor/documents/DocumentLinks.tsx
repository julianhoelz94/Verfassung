import { NavigatingActionForm } from '../../components/NavigatingActionForm';
import { currentLocale } from '../../../lib/server-locale';
import { T } from '../../components/TranslationProvider';
import { ui } from '../../../lib/messages';
import Link from 'next/link';
import { listDocumentLinkEvents, listDocumentLinks, listDocumentRevisions, listDocuments } from '../../../lib/document-api';
import { requireSessionBearer } from '../../../lib/session';
import { detachDocumentAction } from './actions';
import { DocumentPicker } from './DocumentPicker';
import { Alert } from '../../components/ui';
import { Stack } from '../../components/layout/Layout';
import surfaceStyles from '../../components/surfaces.module.css';

export async function DocumentLinks(props: {
  targetType: 'constitution' | 'version' | 'amendment';
  targetId: string;
  scopeRevisionId?: string | null;
  returnTo: string;
  canEdit: boolean;
}) {
  const locale = await currentLocale();
  const authorization = await requireSessionBearer();
  const [linksResult, documentsResult, eventsResult] = await Promise.allSettled([
    listDocumentLinks(props.targetType, props.targetId, props.scopeRevisionId, authorization),
    props.canEdit ? listDocuments(undefined, authorization) : Promise.resolve([]),
    listDocumentLinkEvents(props.targetType, props.targetId, authorization, props.scopeRevisionId),
  ]);
  const unavailable = linksResult.status === 'rejected' || documentsResult.status === 'rejected' || eventsResult.status === 'rejected';
  const links = linksResult.status === 'fulfilled' ? linksResult.value : [];
  const documents = documentsResult.status === 'fulfilled' ? documentsResult.value : [];
  const events = eventsResult.status === 'fulfilled' ? eventsResult.value : [];
  const available = documents.filter((document) => document.status === 'active' && !links.some((link) => link.documentId === document.id));
  const revisions = props.canEdit ? await Promise.all(available.map((document) => listDocumentRevisions(document.id, authorization).catch(() => []))) : [];
  return <Stack as="section" className={["card", surfaceStyles.card].join(' ')}>
    <h2><T value={ui.editor.documents.documentlinks.linkedDocuments} /></h2>
    {unavailable ? <Alert tone="error"><T value={ui.editor.documents.documentlinks.documentServiceIsUnavailableLinksMayBe} /></Alert> : null}
    {links.length ? <ul className="link-list">{links.map((link) => <li key={link.documentId}>
      <Link href={`/documents/${link.documentId}${link.revisionId ? `?revision=${link.document.revision.revision}` : ''}`}>{link.document.revision.title}</Link>
      {' '}· <T value={link.revisionId ? ui.editor.documents.documentlinks.pinnedRevision : ui.editor.documents.documentlinks.currentRevision} />{' '}{link.revisionId ? link.document.revision.revision : link.document.currentRevision}
      {' '}<Link href={`/editor/documents/${link.documentId}`}><T value={ui.editor.documents.documentlinks.inspectHistory} /></Link>
      {props.canEdit ? <NavigatingActionForm action={detachDocumentAction} className="inline-form">
        <input type="hidden" name="targetType" value={props.targetType} /><input type="hidden" name="targetId" value={props.targetId} />
        <input type="hidden" name="scopeRevisionId" value={props.scopeRevisionId ?? ''} />
        <input type="hidden" name="documentId" value={link.documentId} /><input type="hidden" name="returnTo" value={props.returnTo} />
        <button type="submit"><T value={ui.editor.documents.documentlinks.detach} /></button>
      </NavigatingActionForm> : null}
    </li>)}</ul> : <p><T value={ui.editor.documents.documentlinks.noManagedDocumentsLinked} /></p>}
    {props.canEdit && !unavailable ? <>
      <h3><T value={ui.editor.documents.documentlinks.attachAnExistingDocument} /></h3>
      <DocumentPicker documents={available} revisions={revisions} targetType={props.targetType} targetId={props.targetId} scopeRevisionId={props.scopeRevisionId} returnTo={props.returnTo} />
      <p><Link href={`/editor/documents/new?returnTo=${encodeURIComponent(props.returnTo)}`} target="_blank"><T value={ui.editor.documents.documentlinks.createADocumentInANewTab} /></Link> <T value={ui.editor.documents.documentlinks.toKeepThisEditorOpen} /></p>
    </> : null}
    {events.length ? <details><summary><T value={ui.editor.documents.documentlinks.linkHistory} /></summary><ol>{events.map((event) => <li key={event.id}>
      <T value={event.action === 'attach' ? ui.editor.documents.documentlinks.attached : ui.editor.documents.documentlinks.detached} /> · <Link href={`/editor/documents/${event.documentId}`}>{event.documentId}</Link> · {new Date(event.occurredAt).toLocaleString(locale)}
    </li>)}</ol></details> : null}
  </Stack>;
}
