import { listAllImportJobs } from '../../lib/ingestion-api';
import { getMigrationRun, getMigrationRuns } from '../../lib/migration-review';
import { packageReviewHref } from '../../lib/import-review';
import { message, ui } from '../../lib/messages';
import { importWorkspaceUi as m } from '../../lib/import-workspace-messages';
import type { ImportCollectionRow } from '../../lib/import-workspace';
import type { Locale } from '../../lib/locale';

/** Keep complete lists and package membership independent of optional service failures. */
export async function loadImportWorkspace(authorization: string, locale: Locale) {
  const [jobs, packages] = await Promise.allSettled([listAllImportJobs(authorization), getMigrationRuns(authorization).then(value => { if (!value) throw new Error('Packages unavailable'); return value; })]);
  const allJobs = jobs.status === 'fulfilled' ? jobs.value : [];
  const runs = packages.status === 'fulfilled' ? packages.value : [];
  const members = new Set<string>(), packageRows: ImportCollectionRow[] = [];
  let membershipUnavailable = packages.status === 'rejected';
  for (let offset = 0; offset < runs.length; offset += 6) {
    const details = await Promise.all(runs.slice(offset, offset + 6).map(run => getMigrationRun(run.id, authorization).catch(() => null)));
    for (const [index, run] of details.entries()) {
      const summary = runs[offset + index];
      if (!run) membershipUnavailable = true;
      const ids = (run?.items ?? []).flatMap(item => item.result.jobId ? [item.result.jobId] : []);
      ids.forEach(id => members.add(id));
      const countries = [...new Set(allJobs.filter(job => ids.includes(job.id)).map(job => job.countryName || job.isoCode).filter((value): value is string => typeof value === 'string' && Boolean(value)))];
      packageRows.push({ id: summary.id, kind: 'package', title: summary.title, country: countries.length === 1 ? countries[0] : message(locale, countries.length > 1 ? m.packageCountry : m.packageUnknownCountry), period: '', status: run?.items.some(item => item.state === 'failed') ? 'failed' : 'preparing', prepared: run?.items.filter(item => item.kind === 'snapshot' && item.state === 'prepared').length, total: run?.items.filter(item => item.kind === 'snapshot').length, href: packageReviewHref(summary.id) });
    }
  }
  const jobRows: ImportCollectionRow[] = membershipUnavailable ? [] : allJobs.filter(job => !members.has(job.id)).map(job => ({
    id: job.id, kind: 'job', title: job.constitutionTitle || message(locale, ui.remainingStatus.constitutionUnavailable), country: job.countryName || job.isoCode || message(locale, ui.remainingStatus.countryUnavailable), period: job.versionLabel || message(locale, ui.remainingStatus.versionUnavailable), status: job.status, href: `/import/jobs/${encodeURIComponent(job.id)}`,
  }));
  return { rows: [...jobRows, ...packageRows], unavailable: jobs.status === 'rejected' || packages.status === 'rejected', membershipUnavailable };
}
