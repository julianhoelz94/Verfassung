import {
  resolveUnit,
  type AmendmentChange,
  type AmendmentUnitRef,
} from "../../../lib/api";

/** Public amendment records store immutable references, not copies of Content's wording. */
export async function loadPassageWording(
  changes: AmendmentChange[],
  constitutionId: string,
): Promise<AmendmentChange[]> {
  const refs = new Map<string, AmendmentUnitRef>();
  const key = (ref: AmendmentUnitRef) =>
    [ref.versionId, ref.logicalId, ref.occurrenceId, ref.revisionId].join(":");
  for (const change of changes)
    for (const ref of [change.beforeRef, change.afterRef])
      if (ref?.versionId && ref.logicalId && ref.text == null)
        refs.set(key(ref), ref);
  const loaded = new Map<string, AmendmentUnitRef>();
  const pending = [...refs.entries()];
  // Content owns snapshot resolution. Bound concurrency across all visible changes.
  for (let start = 0; start < pending.length; start += 6) {
    await Promise.all(
      pending.slice(start, start + 6).map(async ([id, ref]) => {
        const unit = await resolveUnit(ref.versionId!, ref.logicalId!).catch(
          () => null,
        );
        if (
          !unit ||
          unit.versionId !== ref.versionId ||
          unit.logicalId !== ref.logicalId ||
          unit.constitutionId !== constitutionId ||
          typeof unit.text !== "string" ||
          (ref.occurrenceId && unit.occurrenceId !== ref.occurrenceId) ||
          (ref.revisionId && unit.revisionId !== ref.revisionId)
        )
          return;
        loaded.set(id, {
          ...ref,
          text: unit.text,
          breadcrumbs: unit.pathLabels.slice(0, -1),
          label: ref.label ?? unit.pathLabels.at(-1),
          deepLink: ref.deepLink ?? unit.deepLink,
        });
      }),
    );
  }
  const wording = (ref: AmendmentUnitRef | null | undefined) =>
    ref ? (loaded.get(key(ref)) ?? ref) : ref;
  return changes.map((change) => ({
    ...change,
    beforeRef: wording(change.beforeRef),
    afterRef: wording(change.afterRef),
  }));
}
