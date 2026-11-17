import { currentLocale } from '../../lib/server-locale';
import { editorErrorMessage } from '../../lib/editor-api';
import { inboxFilters, selectedInboxQueue } from '../../lib/editor-inbox';
import { EditorInbox } from './EditorInbox';
import { loadEditorInbox } from './editor-inbox-data';

export async function EditorLanding({ userId, roles, status, workStatus, archived = false, error, query, country, kind }: {
  userId: string; email?: string; roles: string[]; status?: string; workStatus?: string;
  archived?: boolean; error?: string; query?: string; country?: string; kind?: string;
}) {
  const locale = await currentLocale(), queue = selectedInboxQueue(roles, status);
  const filters = inboxFilters({ query, country, kind, workStatus: queue === 'mine' ? workStatus : undefined, archived: queue === 'mine' ? String(archived) : undefined });
  const data = await loadEditorInbox({ userId, roles, queue, archived: filters.archived, locale });
  return <EditorInbox {...data} userId={userId} roles={roles} queue={queue} initialFilters={filters} error={editorErrorMessage(error, locale)} />;
}
