import { listAllImportJobs, type ImportJob } from '../../lib/ingestion-api';
import { getMigrationRun, getMigrationRuns, type MigrationRun } from '../../lib/migration-review';
import { packageReviewHref } from '../../lib/import-review';
import { message, ui } from '../../lib/messages';
import { importWorkspaceUi as m } from '../../lib/import-workspace-messages';
import type { ImportCollectionRow } from '../../lib/import-workspace';
import type { Locale } from '../../lib/locale';

type PackageSummary = NonNullable<Awaited<ReturnType<typeof getMigrationRuns>>>[number];
function jobCountry(job: ImportJob, locale: Locale) {
  return { countryKey: job.isoCode || job.countryName || 'unavailable', country: job.countryName || job.isoCode || message(locale, ui.remainingStatus.countryUnavailable) };
}
function packageRow(summary: PackageSummary, run: MigrationRun | null, jobs: ImportJob[], locale: Locale): ImportCollectionRow {
  const ids = (run?.items ?? []).flatMap(item => item.result.jobId ? [item.result.jobId] : []);
  const countries = [...new Map(jobs.filter(job => ids.includes(job.id)).map(job => { const owner = jobCountry(job, locale); return [owner.countryKey, owner.country] as const; })).entries()];
  const [countryKey, country] = countries.length === 1 ? countries[0] : [countries.length ? 'packages:multiple' : 'packages:unavailable', message(locale, countries.length ? m.packageCountry : m.packageUnknownCountry)];
  const snapshots = run?.items.filter(item => item.kind === 'snapshot');
  return { id: summary.id, kind: 'package', title: summary.title, countryKey, country, period: '', status: run?.items.some(item => item.state === 'failed') ? 'failed' : 'preparing', prepared: snapshots?.filter(item => item.state === 'prepared').length, total: snapshots?.length, href: packageReviewHref(summary.id) };
}
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
      if (!run) membershipUnavailable = true;
      for (const item of run?.items ?? []) if (item.result.jobId) members.add(item.result.jobId);
      packageRows.push(packageRow(runs[offset + index], run, allJobs, locale));
    }
  }
  const jobRows: ImportCollectionRow[] = membershipUnavailable ? [] : allJobs.filter(job => !members.has(job.id)).map(job => ({
    id: job.id, kind: 'job', title: job.constitutionTitle || message(locale, ui.remainingStatus.constitutionUnavailable), ...jobCountry(job, locale), period: job.versionLabel || message(locale, ui.remainingStatus.versionUnavailable), status: job.status, href: `/import/jobs/${encodeURIComponent(job.id)}`,
  }));
  return { rows: [...jobRows, ...packageRows], unavailable: jobs.status === 'rejected' || packages.status === 'rejected', membershipUnavailable };
}
