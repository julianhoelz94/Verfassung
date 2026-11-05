/** Public reader locations are derived from the snapshot's owning Catalog record. */
export type ReaderOwner = { countryCode?: string | null; code?: string | null; jurisdictionId?: string | null };

export function versionReaderHref(owner: ReaderOwner | null | undefined, versionId: string): string | undefined {
  const code = owner?.countryCode ?? owner?.code;
  if (code) return `/countries/${encodeURIComponent(code)}/versions/${encodeURIComponent(versionId)}`;
  if (owner?.jurisdictionId) return `/jurisdictions/${encodeURIComponent(owner.jurisdictionId)}/versions/${encodeURIComponent(versionId)}`;
  return undefined;
}

export function passageReaderHref(owner: ReaderOwner | null | undefined, versionId: string, rootId: string, occurrenceId?: string | null): string | undefined {
  const base = versionReaderHref(owner, versionId);
  if (!base) return undefined;
  return `${base}#${encodeURIComponent(occurrenceId || rootId)}`;
}
