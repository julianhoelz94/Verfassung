export type SnippetPart = {
  text: string;
  mark: boolean;
};

/** Split a ts_headline snippet on `<mark>` / `</mark>` only. Do not parse other HTML. */
export function snippetParts(snippet: string): SnippetPart[] {
  const parts: SnippetPart[] = [];
  let marked = false;
  for (const token of snippet.split(/(<mark>|<\/mark>)/)) {
    if (token === '<mark>') {
      marked = true;
      continue;
    }
    if (token === '</mark>') {
      marked = false;
      continue;
    }
    if (token) {
      parts.push({ text: token, mark: marked });
    }
  }
  return parts;
}
