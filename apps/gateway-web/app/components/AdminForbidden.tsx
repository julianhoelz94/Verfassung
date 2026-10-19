import { T } from './TranslationProvider';
import { ui } from '../../lib/messages';
import { Alert } from './ui';
import { PageMain } from './PageMain';
import type { UiMessage } from '../../lib/messages';

export function AdminForbidden({ title }: { title: UiMessage }) {
  return (
    <PageMain>
      <h1><T value={title} /></h1>
      <Alert tone="error"><T value={ui.components.adminforbidden.administratorRoleRequired} /></Alert>
    </PageMain>
  );
}
