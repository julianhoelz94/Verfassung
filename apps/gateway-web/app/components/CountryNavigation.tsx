import { T } from './TranslationProvider';
import { usability } from '../../lib/usability-messages';

export function CountryNavigation({ code, active }: { code: string; active: 'overview' | 'constitutions' | 'amendments' | 'reading' }) {
  const base = `/countries/${encodeURIComponent(code)}`;
  const history = active === 'constitutions' || active === 'amendments';
  return <div className="country-navigation">
    <nav className="section-nav" aria-labelledby="country-nav-label">
      <span id="country-nav-label" className="sr-only"><T value={usability.countryNavigation} /></span>
      <a href={base} aria-current={active === 'overview' ? 'page' : undefined}><T value={usability.overview} /></a>
      <a href={`${base}/constitution-timeline`} aria-current={history ? 'location' : undefined}><T value={usability.history} /></a>
    </nav>
    {history ? <>
      <nav className="history-views" aria-labelledby="history-views-label">
        <span id="history-views-label" className="sr-only"><T value={usability.historyViews} /></span>
        <a href={`${base}/constitution-timeline`} aria-current={active === 'constitutions' ? 'page' : undefined}><T value={usability.constitutions} /></a>
        <a href={`${base}/timeline`} aria-current={active === 'amendments' ? 'page' : undefined}><T value={usability.amendments} /></a>
      </nav>
      <p className="muted"><T value={active === 'constitutions' ? usability.constitutionHistory : usability.amendmentHistory} /></p>
    </> : null}
  </div>;
}
