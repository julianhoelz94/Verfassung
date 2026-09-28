import type { AmendmentChange } from '../../lib/api';

export function AmendmentUnitLinks({ change }: { change: AmendmentChange }) {
  const before = change.beforeRef?.deepLink;
  const after = change.afterRef?.deepLink;
  if (!before && !after) {
    return change.legacyLinkUnresolved ? <span className="muted">Exact unit link unavailable for this older record.</span> : null;
  }
  return (
    <span className="card-actions" aria-label="Exact constitutional units">
      {before ? <a className="btn btn-sm btn-ghost" href={before}>Before unit{change.beforeRef?.label ? ` · ${change.beforeRef.label}` : ''}</a> : null}
      {after ? <a className="btn btn-sm btn-ghost" href={after}>After unit{change.afterRef?.label ? ` · ${change.afterRef.label}` : ''}</a> : null}
    </span>
  );
}
