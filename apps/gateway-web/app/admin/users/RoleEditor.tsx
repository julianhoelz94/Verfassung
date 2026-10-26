'use client';

import { useRef } from 'react';
import { updateRolesAction } from '../../account/actions';
import { T } from '../../components/TranslationProvider';
import { Button } from '../../components/ui';
import { ui } from '../../../lib/messages';
import { usability } from '../../../lib/usability-messages';
import { Stack, Inline } from '../../components/layout/Layout';
import { RoleFields } from './RoleFields';

export function RoleEditor({ userId, roles }: { userId: string; roles: string[] }) {
  const disclosure = useRef<HTMLDetailsElement>(null);
  return <details className="user-role-editor" ref={disclosure}>
    <summary><T value={usability.editRoles} /></summary>
    <Stack as="form" action={updateRolesAction}>
      <input type="hidden" name="userId" value={userId} />
      <RoleFields roles={roles} />
      <Inline className="form-actions">
        <Button><T value={ui.admin.users.page.updateRoles} /></Button>
        <button type="button" className="btn btn-ghost" onClick={event => {
          event.currentTarget.form?.reset();
          if (disclosure.current) disclosure.current.open = false;
        }}><T value={usability.cancel} /></button>
      </Inline>
    </Stack>
  </details>;
}
