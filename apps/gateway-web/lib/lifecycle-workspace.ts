import type { ConstitutionLifecycleEvent, ExportedUnit, ProvisionLifecycleEvent } from './api';
import { ui, type UiMessage } from './messages';

export type LifecycleScope = 'whole' | 'passages';
export type LifecycleUnit = { id: string; label: string; path: string; depth: number; text: string };
export type LifecycleProvisionContext = { versionHref: string; versionLabel?: string; units: { id: string; path: string }[] };
export type LifecycleVersion = { id: string; label: string };
export type LifecycleEntry = (ConstitutionLifecycleEvent & { scope: 'whole' }) | (ProvisionLifecycleEvent & { scope: 'passages' });

export const lifecycleEventLabels: Record<string, UiMessage> = {
  adopted: ui.lifecycleEvents.adopted, commenced: ui.lifecycleEvents.commenced,
  suspended: ui.lifecycleEvents.suspended, restored: ui.lifecycleEvents.restored,
  repealed: ui.lifecycleEvents.repealed, deferred: ui.editor.lifecycle.constitutionid.page.commencementDeferred,
};

export function nextLifecycleEvents(last?: ConstitutionLifecycleEvent): ConstitutionLifecycleEvent['eventType'][] {
  if (!last) return ['adopted'];
  if (last.eventType === 'adopted') return ['commenced', 'repealed'];
  if (last.eventType === 'suspended') return ['restored', 'repealed'];
  if (last.eventType === 'repealed') return [];
  return ['suspended', 'repealed'];
}

export function flattenLifecycleUnits(roots: ExportedUnit[]): LifecycleUnit[] {
  const rows: LifecycleUnit[] = [];
  function visit(node: ExportedUnit, parents: string[]) {
    const label = [node.kind, node.label, node.title].filter(Boolean).join(' · ') || node.logicalId || '—';
    const path = [...parents, label].join(' / ');
    if (node.logicalId) rows.push({ id: node.logicalId, label, path, depth: parents.length, text: (node.content ?? []).map(entry => entry.text ?? '').join(' ') });
    node.content?.forEach(entry => { if (entry.node) visit(entry.node, [...parents, label]); });
  }
  roots.forEach(node => visit(node, []));
  return rows;
}

export function lifecycleEntries(events: ConstitutionLifecycleEvent[], provisions: ProvisionLifecycleEvent[]): LifecycleEntry[] {
  return [...[...events].reverse().map(event => ({ ...event, scope: 'whole' as const })), ...[...provisions].reverse().map(event => ({ ...event, scope: 'passages' as const }))]
    .sort((left, right) => right.eventDate.localeCompare(left.eventDate));
}

export function effectiveLifecycle(events: ConstitutionLifecycleEvent[], asOf: string) {
  return [...events].filter(event => event.eventDate <= asOf).sort((a, b) => a.eventDate.localeCompare(b.eventDate)).at(-1);
}

export function lifecycleDate(value: string, locale: string, approximate = false) {
  return `${approximate ? locale === 'de' ? 'ca. ' : 'c. ' : ''}${new Intl.DateTimeFormat(locale === 'de' ? 'de-DE' : 'en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(value + 'T12:00:00Z'))}`;
}
