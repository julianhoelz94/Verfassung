export type HistoryKind = 'constitution' | 'amendment';
export type HistoryFilter = 'all' | HistoryKind;

// Match URLSearchParams.get in the root preload when Next supplies repeated values.
export function historyQueryValue(value?: string | string[]): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

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
