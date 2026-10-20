export type HistoryKind = 'constitution' | 'amendment';
export type HistoryFilter = 'all' | HistoryKind;

export function historyFilter(value?: string): HistoryFilter {
  return value === 'constitution' || value === 'amendment' ? value : 'all';
}

export function sortHistory<T extends { id: string; date?: string | null; kind: HistoryKind }>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    if (!a.date && b.date) return 1;
    if (a.date && !b.date) return -1;
    return (a.date ?? '').localeCompare(b.date ?? '') || a.kind.localeCompare(b.kind) || a.id.localeCompare(b.id);
  });
}
