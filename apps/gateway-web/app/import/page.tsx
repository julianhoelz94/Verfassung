import { redirect } from 'next/navigation';
import { currentUser, requireSessionBearer } from '../../lib/session';
import { currentLocale } from '../../lib/server-locale';
import { loginHref, type ReturnSearchParams } from '../../lib/return-to';
import { ui } from '../../lib/messages';
import { AdminForbidden } from '../components/AdminForbidden';
import { loadImportWorkspace } from './import-workspace-data';
import { ImportWorkspace } from './ImportWorkspace';

export default async function ImportsPage({ searchParams }: { searchParams: Promise<ReturnSearchParams> }) {
  const params = await searchParams, user = await currentUser();
  if (!user) redirect(loginHref('/import', params));
  if (!user.roles.some(role => ['editor', 'reviewer', 'publisher', 'admin'].includes(role))) return <AdminForbidden title={ui.forbidden.import} />;
  const data = await loadImportWorkspace(await requireSessionBearer(), await currentLocale());
  return <ImportWorkspace {...data} canImport={user.roles.some(role => ['editor', 'admin'].includes(role))} initialMode={typeof params.mode === 'string' ? params.mode : undefined} initialError={typeof params.error === 'string' ? params.error : undefined} />;
}
