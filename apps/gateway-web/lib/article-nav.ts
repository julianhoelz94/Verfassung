export function neighborsOf<T extends { id: string }>(
  articles: T[],
  currentId: string,
): { previous: T | undefined; next: T | undefined } {
  const index = articles.findIndex((article) => article.id === currentId);
  if (index < 0) {
    return { previous: undefined, next: undefined };
  }
  return {
    previous: articles[index - 1],
    next: articles[index + 1],
  };
}
