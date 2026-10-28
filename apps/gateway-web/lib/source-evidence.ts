import type { SourceEvidence } from './api';

/** Existing import descriptions remain editable without dropping any of their text. */
export function sourceDescriptionText(evidence?: SourceEvidence | null): string {
  if (evidence?.description != null) return evidence.description;
  return [evidence?.dateWording, evidence?.coverage, evidence?.statusWording, evidence?.attribution]
    .filter((value): value is string => value != null && value !== '').join('\n\n');
}
