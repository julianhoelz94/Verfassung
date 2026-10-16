import { T, ui } from './TranslationProvider';
import { Alert } from './ui';
import { PageMain } from './PageMain';

export function AdminForbidden({ title }: { title: string }) {
  return (
    <PageMain>
      <h1>{title}</h1>
      <Alert tone="error"><T value={ui.components.adminforbidden.administratorRoleRequired} /></Alert>
    </PageMain>
  );
}
