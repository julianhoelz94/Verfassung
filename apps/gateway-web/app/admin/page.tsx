import Link from 'next/link';
import { AdminForbidden } from '../components/AdminForbidden';
import { PageMain } from '../components/PageMain';
import { Card, PageHeader } from '../components/ui';
import { requireAdminPage } from '../../lib/admin';

export default async function AdminIndexPage() {
  if (!(await requireAdminPage())) {
    return <AdminForbidden title="Admin" />;
  }
  return (
    <PageMain>
      <PageHeader title="Admin" meta="User accounts, constitution outlines, and import jobs." />
      <div className="card-grid">
        <Card>
          <h2 className="card-title">
            <Link href="/admin/users">Users</Link>
          </h2>
          <p className="muted">Invite accounts, set roles, and revoke sessions.</p>
        </Card>
        <Card>
          <h2 className="card-title">
            <Link href="/admin/constitutions">Outlines</Link>
          </h2>
          <p className="muted">Create constitutions and edit their section outline.</p>
        </Card>
        <Card>
          <h2 className="card-title">
            <Link href="/admin/import">Import</Link>
          </h2>
          <p className="muted">Load a JSON corpus and follow the job until it finishes.</p>
        </Card>
      </div>
    </PageMain>
  );
}
