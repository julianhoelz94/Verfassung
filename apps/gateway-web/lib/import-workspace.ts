export type ImportCollectionRow = {
  id: string; kind: 'job' | 'package'; title: string; country: string; period: string;
  status: string; href: string; prepared?: number; total?: number;
};
export type ImportCollectionFilters = { query: string; status: string; country: string; kind: string };
export const emptyImportFilters: ImportCollectionFilters = { query: '', status: '', country: '', kind: '' };
export function filterImportCollection(rows: ImportCollectionRow[], filters: ImportCollectionFilters, locale: string) {
  const query = filters.query.trim().toLocaleLowerCase(locale);
  return rows.filter(row => (!filters.status || row.status === filters.status) && (!filters.country || row.country === filters.country) && (!filters.kind || row.kind === filters.kind) && `${row.title} ${row.country} ${row.period}`.toLocaleLowerCase(locale).includes(query));
}
