import type { VersionSummary } from '../../../lib/api';
import { orderVersions } from '../../../lib/compare';
import { formatDate } from '../../../lib/format-date';
import { Button } from '../../components/ui';

type CompareFormProps = {
  code: string;
  versions: VersionSummary[];
  fromId?: string;
  toId?: string;
  showAll?: boolean;
  variant?: 'bar' | 'inline';
};

export function CompareForm({
  code,
  versions,
  fromId,
  toId,
  showAll = false,
  variant = 'bar',
}: CompareFormProps) {
  const ordered = orderVersions(versions);
  if (ordered.length < 2) {
    return <p className="muted">Publish at least two versions to compare them.</p>;
  }
  const defaultFrom = fromId ?? ordered[0]?.id;
  const defaultTo = toId ?? ordered[ordered.length - 1]?.id;
  return (
    <form
      className={variant === 'inline' ? 'compare-bar compare-bar-inline' : 'compare-bar'}
      action={`/countries/${code}/compare`}
      method="get"
    >
      {showAll ? <input type="hidden" name="all" value="1" /> : null}
      <label htmlFor="compare-from">
        From
        <select id="compare-from" name="from" defaultValue={defaultFrom}>
          {ordered.map((version) => (
            <option key={version.id} value={version.id}>
              {version.versionLabel}
              {version.effectiveDate ? ` · in force ${formatDate(version.effectiveDate)}` : ''}
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
              {version.effectiveDate ? ` · in force ${formatDate(version.effectiveDate)}` : ''}
            </option>
          ))}
        </select>
      </label>
      <Button variant="primary">Compare</Button>
    </form>
  );
}
