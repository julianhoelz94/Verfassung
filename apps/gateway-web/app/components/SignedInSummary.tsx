import { T } from './TranslationProvider';
import { ui } from '../../lib/messages';
import { roleMessage } from '../../lib/ui-labels';

export function RoleList({ roles }: { roles: string[] }) {
  return <>{roles.map((role, index) => <span key={role}>{index > 0 ? ', ' : ''}<T value={roleMessage(role)} /></span>)}</>;
}

export function SignedInSummary({ email, roles, noEditorialRole }: { email: string; roles?: string[]; noEditorialRole?: boolean }) {
  return <><T value={ui.remainingStatus.signedInAs} /> {email}. {noEditorialRole ? <T value={ui.accountState.noEditorialRole} /> : roles ? <><T value={ui.remainingStatus.roles} />: <RoleList roles={roles} />.</> : null}</>;
}
