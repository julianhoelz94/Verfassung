import { T } from './TranslationProvider';
import { ui } from '../../lib/messages';
import { currentLocale } from '../../lib/server-locale';
import { message } from '../../lib/messages';

export async function WikiSources({ sourceUrls }: { sourceUrls: string[] }) {
  if (!sourceUrls.length) return null;
  const locale = await currentLocale();
  return (
    <section aria-label={message(locale, ui.accessibility.pageSources)}>
      <h3><T value={ui.components.wikisources.sources} /></h3>
      <ul>
        {sourceUrls.map((url, index) => (
          <li key={`${index}-${url}`}><a href={url}><T value={ui.components.wikisources.source} />{" "}{index + 1}</a></li>
        ))}
      </ul>
    </section>
  );
}
