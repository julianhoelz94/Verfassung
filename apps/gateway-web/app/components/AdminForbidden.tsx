import { Alert } from './ui';
import { PageMain } from './PageMain';

export function AdminForbidden({ title }: { title: string }) {
  return (
    <PageMain>
      <h1>{title}</h1>
      <Alert tone="error">Administrator role required.</Alert>
    </PageMain>
  );
}
