import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { requireAdminUser } from '../../../lib/admin';
import { IdentityApiError, requestInvite, requestUpdateRoles } from '../../../lib/identity-client';
import { TranslationProvider } from '../../components/TranslationProvider';
import { inviteUserAction, updateRolesAction } from '../../account/actions';
import { InviteUserForm } from './TokenForms';
import { RoleEditor } from './RoleEditor';

vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => ({ value: 'admin-token' }) }) }));
vi.mock('next/navigation', () => ({ redirect: (href: string) => { throw new Error(`redirect:${href}`); } }));
vi.mock('../../../lib/admin', () => ({ requireAdminUser: vi.fn() }));
vi.mock('../../../lib/identity-client', async (original) => ({
  ...await original<typeof import('../../../lib/identity-client')>(), requestInvite: vi.fn(), requestUpdateRoles: vi.fn(),
}));
vi.mock('react-dom', async (original) => ({
  ...await original<typeof import('react-dom')>(),
  // Server actions are exercised below using the actual browser FormData.
  useFormState: (_action: unknown, initial: unknown) => [initial, '/__test-action'],
}));

describe('role checkbox forms preserve submitted permissions', () => {
  let host: HTMLDivElement;
  let root: Root;
  beforeEach(() => {
    vi.clearAllMocks();
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    vi.mocked(requireAdminUser).mockResolvedValue({ id: 'admin', email: 'admin@example.test', roles: ['admin'] });
    vi.mocked(requestInvite).mockResolvedValue({ inviteToken: 'invitation' });
    vi.mocked(requestUpdateRoles).mockResolvedValue(undefined);
    host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host);
  });
  afterEach(async () => { await act(async () => root.unmount()); host.remove(); });

  async function invite(locale: 'en' | 'de' = 'en') {
    await act(async () => root.render(<TranslationProvider locale={locale}><InviteUserForm /></TranslationProvider>));
    host.querySelector<HTMLInputElement>('[name=email]')!.value = 'new@example.test';
  }
  async function roleEditor() {
    await act(async () => root.render(<TranslationProvider locale="en"><RoleEditor userId="user-1" roles={['editor', 'reviewer']} /></TranslationProvider>));
  }
  function checkbox(role: string) { return host.querySelector<HTMLInputElement>(`input[name=role][value=${role}]`)!; }
  async function toggle(role: string) { await act(async () => checkbox(role).click()); }
  function data() { return new FormData(host.querySelector('form')!); }

  it('invites readers by default without selecting editorial or administration rights', async () => {
    await invite();
    expect(host.querySelectorAll('input[type=checkbox]')).toHaveLength(5);
    expect(data().getAll('role')).toEqual(['viewer']);
    expect(await inviteUserAction({}, data())).toEqual({ token: 'invitation' });
    expect(requireAdminUser).toHaveBeenCalled();
    expect(requestInvite).toHaveBeenCalledWith('admin-token', 'new@example.test', ['viewer']);
  });

  it('sends exactly the selected combination to the existing invitation client', async () => {
    await invite();
    await toggle('viewer'); await toggle('editor'); await toggle('reviewer');
    await inviteUserAction({}, data());
    expect(requestInvite).toHaveBeenCalledWith('admin-token', 'new@example.test', ['editor', 'reviewer']);
  });

  it('passes an explicitly empty choice to validation instead of silently restoring the default', async () => {
    await invite(); await toggle('viewer');
    vi.mocked(requestInvite).mockRejectedValueOnce(new IdentityApiError('At least one role is required', 400));
    expect(data().getAll('role')).toEqual([]);
    expect(data().get('roles')).toBe('');
    expect(await inviteUserAction({}, data())).toEqual({ error: true });
    expect(requestInvite).toHaveBeenCalledWith('admin-token', 'new@example.test', []);
  });

  it('uses localized accessible labels and descriptions while submitting stable role identifiers', async () => {
    await invite('de');
    const reader = checkbox('viewer');
    expect(document.getElementById(reader.getAttribute('aria-labelledby')!)?.textContent).toBe('Leser');
    for (const input of host.querySelectorAll<HTMLInputElement>('input[name=role]')) {
      expect(document.getElementById(input.getAttribute('aria-describedby')!)?.textContent).toBeTruthy();
    }
    await toggle('publisher');
    await inviteUserAction({}, data());
    expect(requestInvite).toHaveBeenCalledWith('admin-token', 'new@example.test', ['viewer', 'publisher']);
  });

  it('keeps the existing roles on cancel without submitting a permission change', async () => {
    await roleEditor();
    const details = host.querySelector('details')!; details.open = true;
    await toggle('publisher'); await toggle('editor');
    expect(data().getAll('role')).toEqual(['reviewer', 'publisher']);
    await act(async () => [...host.querySelectorAll('button')].find(button => button.textContent === 'Cancel')!.click());
    expect(data().getAll('role')).toEqual(['editor', 'reviewer']);
    expect(details.open).toBe(false);
    expect(requestUpdateRoles).not.toHaveBeenCalled();
  });

  it('updates only the chosen roles through the existing action', async () => {
    await roleEditor(); await toggle('editor'); await toggle('publisher');
    await expect(updateRolesAction(data())).rejects.toThrow('redirect:/admin/users');
    expect(requestUpdateRoles).toHaveBeenCalledWith('admin-token', 'user-1', ['reviewer', 'publisher']);
  });

  it('retains the administrator guard before making an invitation request', async () => {
    await invite();
    vi.mocked(requireAdminUser).mockRejectedValueOnce(new Error('forbidden'));
    await expect(inviteUserAction({}, data())).rejects.toThrow('forbidden');
    expect(requestInvite).not.toHaveBeenCalled();
  });
});
