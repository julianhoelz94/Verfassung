import { snippetParts } from '../../lib/search-snippet';

export function SearchSnippet({ snippet }: { snippet: string }) {
  const parts = snippetParts(snippet);
  if (parts.length === 0) {
    return null;
  }
  return (
    <p className="search-snippet">
      {parts.map((part, index) =>
        part.mark ? <mark key={index}>{part.text}</mark> : <span key={index}>{part.text}</span>,
      )}
    </p>
  );
}
