'use client';

import { T, useLocale, useTranslation } from '../../components/TranslationProvider';
import { ui } from '../../../lib/messages';
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
  actionHref?: string;
  idPrefix?: string;
};

export function CompareForm({
  code,
  versions,
  fromId,
  toId,
  showAll = false,
  variant = 'bar',
  actionHref,
  idPrefix = 'compare',
}: CompareFormProps) {
  const locale = useLocale();
  const t = useTranslation();
  const ordered = orderVersions(versions);
  if (ordered.length < 2) {
    return <p className="muted"><T value={ui.countries.code.compareform.publishAtLeastTwoVersionsToCompare} /></p>;
  }
  const defaultFrom = fromId ?? ordered[0]?.id;
  const defaultTo = toId ?? ordered[ordered.length - 1]?.id;
  return (
    <form
      className={variant === 'inline' ? 'compare-bar compare-bar-inline' : 'compare-bar'}
      action={actionHref ?? `/countries/${code}/compare`}
      method="get"
    >
      {showAll ? <input type="hidden" name="all" value="1" /> : null}
      <label htmlFor={`${idPrefix}-from`}>
        <T value={ui.countries.code.compareform.from} />{" "}<select id={`${idPrefix}-from`} name="from" defaultValue={defaultFrom}>
          {ordered.map((version) => (
            <option key={version.id} value={version.id}>
              {version.versionLabel}
              {version.effectiveDate ? ` · ${t(ui.remainingStatus.inForce)} ${formatDate(version.effectiveDate, locale)}` : ''}
            </option>
          ))}
        </select>
      </label>
      <label htmlFor={`${idPrefix}-to`}>
        <T value={ui.countries.code.compareform.to} />{" "}<select id={`${idPrefix}-to`} name="to" defaultValue={defaultTo}>
          {ordered.map((version) => (
            <option key={`to-${version.id}`} value={version.id}>
              {version.versionLabel}
              {version.effectiveDate ? ` · ${t(ui.remainingStatus.inForce)} ${formatDate(version.effectiveDate, locale)}` : ''}
            </option>
          ))}
        </select>
      </label>
      <Button variant="primary"><T value={ui.countries.code.compareform.compare} /></Button>
    </form>
  );
}
