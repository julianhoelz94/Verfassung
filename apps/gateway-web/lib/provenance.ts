export function httpUrl(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }
  try {
    const url = new URL(value);
    if (url.protocol === 'http:' || url.protocol === 'https:') {
      return url.href;
    }
  } catch {
    return null;
  }
  return null;
}

export function provenanceLabel(provenance: string): string {
  switch (provenance) {
    case 'official':
      return 'Official text';
    case 'imported':
      return 'Imported text — not an official publication';
    case 'demo':
      return 'Demo / sample text — not official';
    default:
      return 'Source kind not recorded — not claimed as official';
  }
}

export function verificationLabel(version: {
  verificationState: string;
  verifiedBy: string | null;
  verifiedAt: string | null;
}): string {
  if (version.verificationState === 'verified') {
    const who = version.verifiedBy ? ` by ${version.verifiedBy}` : '';
    const when = version.verifiedAt ? ` on ${version.verifiedAt.slice(0, 10)}` : '';
    return `Verified${who}${when}`;
  }
  return 'Not independently verified';
}
