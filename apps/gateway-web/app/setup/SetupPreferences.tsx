import { NavigatingActionForm } from '../components/NavigatingActionForm';
import { T } from '../components/TranslationProvider';
import { Alert, Button, Card } from '../components/ui';
import { ui } from '../../lib/messages';
import { reviewUi } from '../../lib/ui-review-messages';
import { setupMessages as m } from '../../lib/setup-messages';
import type { SetupDetails } from '../../lib/deployment-setup';
import type { Locale } from '../../lib/locale';
import { saveSetupPreferences } from './actions';

export function SetupPreferences({ details, returnTo }: { details: SetupDetails; returnTo: '/setup' | '/admin/settings' }) {
  return <Card><h2><T value={m.general} /></h2>
    <NavigatingActionForm action={saveSetupPreferences} className="stack">
      <input type="hidden" name="returnTo" value={returnTo} />
      <fieldset className="stack"><legend><T value={m.languages} /></legend>
        <p><T value={m.languageHint} /></p>
        {details.languages.managed ? <Alert><T value={m.managed} /></Alert> : null}
        {details.languages.supported.map(language => <label key={language}>
          <input type="checkbox" name="enabledLanguages" value={language} defaultChecked={details.languages.enabled.includes(language)} disabled={details.languages.managed} />
          <T value={ui.languageNames[language as Locale]} />
          {details.languages.managed && details.languages.enabled.includes(language) ? <input type="hidden" name="enabledLanguages" value={language} /> : null}
        </label>)}
        <label htmlFor="defaultLanguage"><T value={m.fallback} /></label>
        <select id="defaultLanguage" name="defaultLanguage" defaultValue={details.languages.defaultLanguage} disabled={details.languages.managed}>
          {details.languages.supported.map(language => <option key={language} value={language}><T value={ui.languageNames[language as Locale]} /></option>)}
        </select>
        {details.languages.managed ? <input type="hidden" name="defaultLanguage" value={details.languages.defaultLanguage} /> : null}
      </fieldset>
      <fieldset><legend><T value={m.email} /></legend>
        <label><input type="checkbox" name="mailDeferred" defaultChecked={details.preferences.mailDeferred} /> <T value={m.deferEmail} /></label>
        <p><T value={m.deferHint} /></p>
      </fieldset>
      <fieldset><legend><T value={m.access} /></legend>
        <p><T value={details.status.completed ? reviewUi.accessAfterSetup : m.accessHint} /></p>
        <p><a href="/admin/anonymous-browsing"><T value={m.accessLink} /></a></p>
        <label><input type="checkbox" name="accessReviewed" defaultChecked={details.preferences.accessReviewed} /> <T value={m.accessReviewed} /></label>
      </fieldset>
      <Button variant="primary"><T value={m.save} /></Button>
    </NavigatingActionForm>
  </Card>;
}
