export function WikiSources({ sourceUrls }: { sourceUrls: string[] }) {
  if (!sourceUrls.length) return null;
  return (
    <section aria-label="Page sources">
      <h3>Sources</h3>
      <ul>
        {sourceUrls.map((url, index) => (
          <li key={`${index}-${url}`}><a href={url}>Source {index + 1}</a></li>
        ))}
      </ul>
    </section>
  );
}
