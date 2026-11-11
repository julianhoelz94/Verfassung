import { T } from './TranslationProvider';
import { ui } from '../../lib/messages';
import { LocalizedRegion } from './LocalizedRegion';

export function WikiSources({ sourceUrls }: { sourceUrls: string[] }) {
  if (!sourceUrls.length) return null;
  return (
    <LocalizedRegion as="section" label={ui.accessibility.pageSources}>
      <h3><T value={ui.components.wikisources.sources} /></h3>
      <ul>
        {sourceUrls.map((url, index) => (
          <li key={`${index}-${url}`}><a href={url}><T value={ui.components.wikisources.source} />{" "}{index + 1}</a></li>
        ))}
      </ul>
    </LocalizedRegion>
  );
}
