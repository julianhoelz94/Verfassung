import type { VersionSummary } from '../../../lib/api';
import { orderVersions } from '../../../lib/compare';

type CompareFormProps = {
  code: string;
  versions: VersionSummary[];
  fromId?: string;
  toId?: string;
};

export function CompareForm({ code, versions, fromId, toId }: CompareFormProps) {
  const ordered = orderVersions(versions);
  if (ordered.length < 2) {
    return <p className="muted">Publish at least two versions to compare them.</p>;
  }
  const defaultFrom = fromId ?? ordered[0]?.id;
  const defaultTo = toId ?? ordered[ordered.length - 1]?.id;
  return (
    <form className="compare-form" action={`/countries/${code}/compare`} method="get">
      <label htmlFor="compare-from">
        From
        <select id="compare-from" name="from" defaultValue={defaultFrom}>
          {ordered.map((version) => (
            <option key={version.id} value={version.id}>
              {version.versionLabel}
              {version.effectiveDate ? ` (${version.effectiveDate})` : ''}
            </option>
          ))}
        </select>
      </label>
      <label htmlFor="compare-to">
        To
        <select id="compare-to" name="to" defaultValue={defaultTo}>
          {ordered.map((version) => (
            <option key={`to-${version.id}`} value={version.id}>
              {version.versionLabel}
              {version.effectiveDate ? ` (${version.effectiveDate})` : ''}
            </option>
          ))}
        </select>
      </label>
      <button type="submit">Compare</button>
    </form>
  );
}
