'use client';

import { useId } from 'react';
import { ui, type UiMessage } from '../../../lib/messages';
import { roleMessage } from '../../../lib/ui-labels';
import { T } from '../../components/TranslationProvider';
import styles from './RoleFields.module.css';

const knownRoles = ['viewer', 'editor', 'reviewer', 'publisher', 'admin'] as const;
const help: Record<typeof knownRoles[number], UiMessage> = {
  viewer: { en: 'Read published constitutions.', de: 'Veröffentlichte Verfassungen lesen.' },
  editor: { en: 'Edit drafts and submit them for review.', de: 'Entwürfe bearbeiten und zur Prüfung einreichen.' },
  reviewer: { en: 'Check submitted drafts and approve them for publication.', de: 'Eingereichte Entwürfe prüfen und zur Veröffentlichung freigeben.' },
  publisher: { en: 'Publish approved text and legal changes.', de: 'Freigegebene Texte und Rechtsänderungen veröffentlichen.' },
  admin: { en: 'Manage people and settings, with all editing and publishing permissions.', de: 'Personen und Einstellungen verwalten sowie alle Redaktions- und Veröffentlichungsaufgaben ausführen.' },
};
const selectionHint: UiMessage = {
  en: 'Choose at least one role. Combine roles when needed.',
  de: 'Wählen Sie mindestens eine Rolle. Bei Bedarf können Sie Rollen kombinieren.',
};

export function RoleFields({ roles }: { roles: string[] }) {
  const id = useId();
  return <fieldset className={styles.fields} aria-describedby={`${id}-hint`}>
    <legend><T value={ui.admin.users.page.roles} /></legend>
    <p id={`${id}-hint`} className={styles.hint}><T value={selectionHint} /></p>
    {/* An explicit empty choice must reach validation, not the invite default. */}
    <input type="hidden" name="roles" value="" />
    <div className={styles.options}>
      {knownRoles.map(role => <label className={styles.option} key={role}>
        <input type="checkbox" name="role" value={role} defaultChecked={roles.includes(role)}
          aria-labelledby={`${id}-${role}-label`} aria-describedby={`${id}-${role}-help`} />
        <span>
          <span id={`${id}-${role}-label`} className={styles.label}><T value={roleMessage(role)} /></span>
          <span id={`${id}-${role}-help`} className={styles.description}><T value={help[role]} /></span>
        </span>
      </label>)}
    </div>
  </fieldset>;
}
