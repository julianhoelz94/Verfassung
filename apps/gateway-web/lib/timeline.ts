import type { Amendment } from './api';

export function sortAmendmentsByEnactment(amendments: Amendment[]): Amendment[] {
  return [...amendments].sort((a, b) => {
    if (a.enactedOn === b.enactedOn) {
      return a.title.localeCompare(b.title);
    }
    if (!a.enactedOn) {
      return 1;
    }
    if (!b.enactedOn) {
      return -1;
    }
    return a.enactedOn.localeCompare(b.enactedOn);
  });
}
