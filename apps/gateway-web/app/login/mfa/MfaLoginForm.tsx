import { ui } from '../../../lib/messages';
import { reviewUi } from '../../../lib/ui-review-messages';
import { Button, Input } from '../../components/ui';
import { T } from '../../components/TranslationProvider';
import { completeMfaAction } from '../actions';
import { NavigatingActionForm } from '../../components/NavigatingActionForm';
import { Inline } from '../../components/layout/Layout';

export function MfaLoginForm({ next, recovery = false, focus = false }: { next?: string; recovery?: boolean; focus?: boolean }) {
  const switchHref = `/login/mfa?method=${recovery ? 'authenticator' : 'recovery'}${next ? `&next=${encodeURIComponent(next)}` : ''}`;
  return <NavigatingActionForm action={completeMfaAction} className="mfa-form" autoFocusName={focus ? (recovery ? 'recoveryCode' : 'code') : undefined}>
    {next ? <input type="hidden" name="next" value={next} /> : null}
    <input type="hidden" name="method" value={recovery ? 'recovery' : 'authenticator'} />
    <p id="mfa-method-hint"><T value={recovery ? reviewUi.recoveryHint : reviewUi.codeHint} /></p>
    {recovery ? <Input label={<T value={ui.attrs.loginMfaPageInputLabelRecovery} />} id="recoveryCode" name="recoveryCode" autoComplete="off" aria-describedby="mfa-method-hint" required /> :
      <Input label={<T value={ui.attrs.loginMfaPageInputLabelAuthenticator} />} id="code" name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} aria-describedby="mfa-method-hint" required />}
    <Inline className="form-actions">
      <Button variant="primary"><T value={ui.login.mfa.page.continue} /></Button>
      <a className="btn btn-ghost" href={switchHref}><T value={recovery ? reviewUi.authenticator : reviewUi.recovery} /></a>
    </Inline>
  </NavigatingActionForm>;
}
