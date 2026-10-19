'use client';

import { useState } from 'react';
import { T } from '../components/TranslationProvider';
import { Button } from '../components/ui';
import { availableLocales } from '../../lib/locale';
import { ui } from '../../lib/messages';
import { updateLanguagePreferenceAction } from './actions';

export function LanguagePreferenceForm({ preference, enabled = availableLocales }: { preference: string; enabled?: readonly string[] }) {
  const [saving, setSaving] = useState(false);
  return (
    <form className="preference-form" onSubmit={async (event) => {
      event.preventDefault();
      if (saving) return;
      setSaving(true);
      try {
        const saved = await updateLanguagePreferenceAction(new FormData(event.currentTarget));
        window.location.assign(saved ? '/account?languageSaved=1' : '/account?error=language');
      } catch {
        window.location.assign('/account?error=language');
      }
    }}>
      <label htmlFor="languagePreference"><T value={ui.account.page.websiteLanguage} /></label>
      <select id="languagePreference" name="languagePreference" defaultValue={preference === 'auto' || enabled.includes(preference) ? preference : 'auto'}>
        <option value="auto"><T value={ui.account.page.automaticDeviceLanguage} /></option>
        {availableLocales.filter(locale => enabled.includes(locale)).map((locale) => (
          <option value={locale} key={locale}><T value={ui.languageNames[locale]} /></option>
        ))}
      </select>
      <Button variant="primary" disabled={saving}><T value={ui.account.page.saveLanguage} /></Button>
    </form>
  );
}
