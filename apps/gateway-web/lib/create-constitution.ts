export function constitutionIsoCode(raw: string): string {
  const isoCode = raw.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(isoCode)) {
    throw new Error('isoCode');
  }
  return isoCode;
}

export function countryToCreate(isoCode: string, countryName: string): { isoCode: string; name: string } | null {
  const name = countryName.trim();
  if (!name) {
    return null;
  }
  return { isoCode: constitutionIsoCode(isoCode), name };
}
