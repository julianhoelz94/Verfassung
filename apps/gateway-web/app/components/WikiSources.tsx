import { T, ui } from './TranslationProvider';
export function WikiSources({ sourceUrls }: { sourceUrls: string[] }) {
  if (!sourceUrls.length) return null;
  return (
    <section aria-label="Page sources">
      <h3><T value={ui.components.wikisources.sources} /></h3>
      <ul>
        {sourceUrls.map((url, index) => (
          <li key={`${index}-${url}`}><a href={url}><T value={ui.components.wikisources.source} />{" "}{index + 1}</a></li>
        ))}
      </ul>
    </section>
  );
}
