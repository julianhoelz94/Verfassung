import type { Locale } from './locale';

/** Shared bibliography types for the compact picker and the full document library. */
export const documentItemTypes = {
  misc: { en: 'Other', de: 'Sonstiges' },
  image: { en: 'Image', de: 'Bild' },
  article: { en: 'Journal article', de: 'Zeitschriftenartikel' },
  book: { en: 'Book', de: 'Buch' },
  inbook: { en: 'Book section', de: 'Buchabschnitt' },
  incollection: { en: 'Chapter in collection', de: 'Sammelbandbeitrag' },
  inproceedings: { en: 'Conference paper', de: 'Konferenzbeitrag' },
  techreport: { en: 'Report', de: 'Bericht' },
  online: { en: 'Webpage', de: 'Webseite' },
  legislation: { en: 'Legislation', de: 'Rechtsvorschrift' },
  treaty: { en: 'Treaty', de: 'Vertrag' },
  phdthesis: { en: 'Doctoral thesis', de: 'Dissertation' },
  mastersthesis: { en: 'Master’s thesis', de: 'Masterarbeit' },
  manual: { en: 'Manual', de: 'Handbuch' },
  unpublished: { en: 'Unpublished', de: 'Unveröffentlicht' },
} as const;

export function documentItemTypeLabels(locale: Locale): Record<string, string> {
  return Object.fromEntries(Object.entries(documentItemTypes).map(([type, label]) => [type, label[locale]]));
}
