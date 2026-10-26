import { T } from './TranslationProvider';
import { usability } from '../../lib/usability-messages';

export function CountryNavigation({ code, active }: { code: string; active: 'overview' | 'history' | 'reading' }) {
  const base = `/countries/${encodeURIComponent(code)}`;
  const history = active === 'history';
  return <div className="country-navigation">
    <nav className="section-nav" aria-labelledby="country-nav-label">
      <span id="country-nav-label" className="sr-only"><T value={usability.countryNavigation} /></span>
      <a href={base} aria-current={active === 'overview' ? 'page' : undefined}><T value={usability.overview} /></a>
      <a href={`${base}/timeline`} aria-current={history ? 'location' : undefined}><T value={usability.history} /></a>
    </nav>
  </div>;
}
