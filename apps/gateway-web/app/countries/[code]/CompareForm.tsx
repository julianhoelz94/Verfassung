import type { VersionSummary } from '../../../lib/api';

type CompareFormProps = {
  code: string;
  versions: VersionSummary[];
  fromId?: string;
  toId?: string;
};

export function CompareForm({ code, versions, fromId, toId }: CompareFormProps) {
  if (versions.length < 2) {
    return <p className="muted">Publish at least two versions to compare them.</p>;
  }
  const defaultFrom = fromId ?? versions[0]?.id;
  const defaultTo = toId ?? versions[versions.length - 1]?.id;
  return (
    <form className="compare-form" action={`/countries/${code}/compare`} method="get">
      <label>
        From
        <select name="from" defaultValue={defaultFrom}>
          {versions.map((version) => (
            <option key={version.id} value={version.id}>
              {version.versionLabel}
              {version.effectiveDate ? ` (${version.effectiveDate})` : ''}
            </option>
          ))}
        </select>
      </label>
      <label>
        To
        <select name="to" defaultValue={defaultTo}>
          {versions.map((version) => (
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
