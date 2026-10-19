import { T } from './TranslationProvider';
import { ui } from '../../lib/messages';
import type { AmendmentChange } from '../../lib/api';
import { currentLocale } from '../../lib/server-locale';
import { message } from '../../lib/messages';

export async function AmendmentUnitLinks({ change }: { change: AmendmentChange }) {
  const before = change.beforeRef?.deepLink;
  const after = change.afterRef?.deepLink;
  if (!before && !after) {
    return change.legacyLinkUnresolved ? <span className="muted"><T value={ui.components.amendmentunitlinks.exactUnitLinkUnavailableForThisOlder} /></span> : null;
  }
  const locale = await currentLocale();
  return (
    <span className="card-actions" aria-label={message(locale, ui.accessibility.exactConstitutionalUnits)}>
      {before ? <a className="btn btn-sm btn-ghost" href={before}><T value={ui.components.amendmentunitlinks.beforeUnit} />{change.beforeRef?.label ? ` · ${change.beforeRef.label}` : ''}</a> : null}
      {after ? <a className="btn btn-sm btn-ghost" href={after}><T value={ui.components.amendmentunitlinks.afterUnit} />{change.afterRef?.label ? ` · ${change.afterRef.label}` : ''}</a> : null}
    </span>
  );
}
