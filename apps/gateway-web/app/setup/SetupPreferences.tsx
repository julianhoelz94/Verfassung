import { NavigatingActionForm } from '../components/NavigatingActionForm';
import { T } from '../components/TranslationProvider';
import { Alert, Button, Card, Select } from '../components/ui';
import { ui } from '../../lib/messages';
import { reviewUi } from '../../lib/ui-review-messages';
import { setupMessages as m } from '../../lib/setup-messages';
import type { SetupDetails } from '../../lib/deployment-setup';
import type { Locale } from '../../lib/locale';
import { saveSetupPreferences } from './actions';
import { Stack } from '../components/layout/Layout';

export function SetupPreferences({ details, returnTo }: { details: SetupDetails; returnTo: '/setup' | '/admin/settings' }) {
  return <Card><h2><T value={m.general} /></h2>
    <NavigatingActionForm action={saveSetupPreferences}>
      <input type="hidden" name="returnTo" value={returnTo} />
      <Stack as="fieldset"><legend><T value={m.languages} /></legend>
        <p><T value={m.languageHint} /></p>
        {details.languages.managed ? <Alert><T value={m.managed} /></Alert> : null}
        {details.languages.supported.map(language => <label key={language}>
          <input type="checkbox" name="enabledLanguages" value={language} defaultChecked={details.languages.enabled.includes(language)} disabled={details.languages.managed} />
          <T value={ui.languageNames[language as Locale]} />
          {details.languages.managed && details.languages.enabled.includes(language) ? <input type="hidden" name="enabledLanguages" value={language} /> : null}
        </label>)}
        <Select label={<T value={m.fallback} />} id="defaultLanguage" name="defaultLanguage" defaultValue={details.languages.defaultLanguage} disabled={details.languages.managed}>
          {details.languages.supported.map(language => <option key={language} value={language}><T value={ui.languageNames[language as Locale]} /></option>)}
        </Select>
        {details.languages.managed ? <input type="hidden" name="defaultLanguage" value={details.languages.defaultLanguage} /> : null}
      </Stack>
      <fieldset><legend><T value={m.access} /></legend>
        <p><T value={details.status.completed ? reviewUi.accessAfterSetup : m.accessHint} /></p>
        <p><a href={`/admin/anonymous-browsing?returnTo=${encodeURIComponent(returnTo)}`}><T value={m.accessLink} /></a></p>
        <label><input type="checkbox" name="accessReviewed" defaultChecked={details.preferences.accessReviewed} /> <T value={m.accessReviewed} /></label>
      </fieldset>
      <Button variant="primary"><T value={m.save} /></Button>
    </NavigatingActionForm>
  </Card>;
}
