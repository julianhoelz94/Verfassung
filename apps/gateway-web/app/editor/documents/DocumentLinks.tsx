import { currentLocale } from '../../../lib/server-locale';
import { T } from '../../components/TranslationProvider';
import { ui } from '../../../lib/messages';
import { listDocumentLinkEvents, listDocumentLinks, listDocumentRevisions, listDocuments } from '../../../lib/document-api';
import { requireSessionBearer } from '../../../lib/session';
import { DocumentManager } from './DocumentManager';
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
  const available = documents.filter(document => document.status === 'active');
  const revisions = props.canEdit ? await Promise.all(available.map(document => listDocumentRevisions(document.id, authorization).catch(() => [document.revision]))) : [];
  return <Stack as="section" className={surfaceStyles.card}>
    {unavailable ? <Alert tone="error"><T value={ui.editor.documents.documentlinks.documentServiceIsUnavailableLinksMayBe} /></Alert> : null}
    <DocumentManager key={`${props.targetType}:${props.targetId}:${props.scopeRevisionId ?? ''}`} links={links} documents={available}
      revisions={Object.fromEntries(available.map((document, index) => [document.id, revisions[index]]))}
      targetType={props.targetType} targetId={props.targetId} scopeRevisionId={props.scopeRevisionId} canEdit={props.canEdit && !unavailable} />
    {events.length ? <details><summary><T value={ui.editor.documents.documentlinks.linkHistory} /></summary><ol>{events.map((event) => <li key={event.id}>
      <T value={event.action === 'attach' ? ui.editor.documents.documentlinks.attached : ui.editor.documents.documentlinks.detached} /> · <a href={`/editor/documents/${event.documentId}`}>{event.documentId}</a> · {new Date(event.occurredAt).toLocaleString(locale)}
    </li>)}</ol></details> : null}
  </Stack>;
}
