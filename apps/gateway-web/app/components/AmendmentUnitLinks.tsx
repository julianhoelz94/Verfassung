import { T, ui } from './TranslationProvider';
import type { AmendmentChange } from '../../lib/api';

export function AmendmentUnitLinks({ change }: { change: AmendmentChange }) {
  const before = change.beforeRef?.deepLink;
  const after = change.afterRef?.deepLink;
  if (!before && !after) {
    return change.legacyLinkUnresolved ? <span className="muted"><T value={ui.components.amendmentunitlinks.exactUnitLinkUnavailableForThisOlder} /></span> : null;
  }
  return (
    <span className="card-actions" aria-label="Exact constitutional units">
      {before ? <a className="btn btn-sm btn-ghost" href={before}><T value={ui.components.amendmentunitlinks.beforeUnit} />{change.beforeRef?.label ? ` · ${change.beforeRef.label}` : ''}</a> : null}
      {after ? <a className="btn btn-sm btn-ghost" href={after}><T value={ui.components.amendmentunitlinks.afterUnit} />{change.afterRef?.label ? ` · ${change.afterRef.label}` : ''}</a> : null}
    </span>
  );
}
