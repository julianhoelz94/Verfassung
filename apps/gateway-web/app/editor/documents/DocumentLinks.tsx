import { currentLocale } from '../../../lib/server-locale';
import { T } from '../../components/TranslationProvider';
import { ui } from '../../../lib/messages';
import { listDocumentLinkEvents, listDocumentLinks, listLibraryDocuments } from '../../../lib/document-api';
import { currentUser, requireSessionBearer } from '../../../lib/session';
import { canManageDocuments } from '../../../lib/nav';
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
  const user = await currentUser();
  const canEdit = props.canEdit && !!user && canManageDocuments(user.roles);
  const authorization = await requireSessionBearer();
  const [linksResult, documentsResult, eventsResult] = await Promise.allSettled([
    listDocumentLinks(props.targetType, props.targetId, props.scopeRevisionId, authorization),
    canEdit ? listLibraryDocuments({ status: 'active', offset: 0, limit: 30, sort: 'title' }, authorization) : Promise.resolve({ items: [], total: 0, offset: 0, limit: 30 }),
    listDocumentLinkEvents(props.targetType, props.targetId, authorization, props.scopeRevisionId),
  ]);
  const unavailable = linksResult.status === 'rejected' || documentsResult.status === 'rejected' || eventsResult.status === 'rejected';
  const links = linksResult.status === 'fulfilled' ? linksResult.value : [];
  const page = documentsResult.status === 'fulfilled' ? documentsResult.value : { items: [], total: 0 };
  const documents = page.items;
  const events = eventsResult.status === 'fulfilled' ? eventsResult.value : [];
  const available = documents.filter(document => document.status === 'active');
  return <Stack as="section" className={surfaceStyles.card}>
    {unavailable ? <Alert tone="error"><T value={ui.editor.documents.documentlinks.documentServiceIsUnavailableLinksMayBe} /></Alert> : null}
    <DocumentManager key={`${props.targetType}:${props.targetId}:${props.scopeRevisionId ?? ''}`} links={links} documents={available}
      revisions={{}} documentTotal={page.total} remoteSearch
      targetType={props.targetType} targetId={props.targetId} scopeRevisionId={props.scopeRevisionId} canEdit={canEdit && !unavailable} />
    {events.length ? <details><summary><T value={ui.editor.documents.documentlinks.linkHistory} /></summary><ol>{events.map((event) => <li key={event.id}>
      <T value={event.action === 'attach' ? ui.editor.documents.documentlinks.attached : ui.editor.documents.documentlinks.detached} /> · <a href={`/documents?documentId=${encodeURIComponent(event.documentId)}`}>{event.documentId}</a> · {new Date(event.occurredAt).toLocaleString(locale)}
    </li>)}</ol></details> : null}
  </Stack>;
}
