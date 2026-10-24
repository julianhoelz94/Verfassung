import type { ContentOutline, OutlineKindWrite } from './api';
import type { SetupProposal } from './ingestion-api';

export function setupKinds(payload: SetupProposal['payload']): OutlineKindWrite[] {
  return (payload.outline?.kinds ?? []) as OutlineKindWrite[];
}

export function displayKinds(kinds: OutlineKindWrite[]) {
  return kinds.map(kind => ({ kindCode: kind.kindCode, displayLabel: kind.displayLabel, presentation: kind.presentation ?? 'section', showKind: kind.showKind ?? false, showLabel: kind.showLabel ?? true, showTitle: kind.showTitle ?? true, labelPlacement: kind.labelPlacement ?? 'before_title' }));
}

export function setupOutline(kinds: OutlineKindWrite[]): ContentOutline {
  return { kinds: kinds.map((kind, index) => {
    const allowedChildKinds = kind.allowedChildKinds ?? (kinds[index + 1] ? [kinds[index + 1].kindCode] : []);
    return { ...kind, sortOrder: index + 1, root: kind.root ?? index === 0, allowedChildKinds, mayHoldChildren: allowedChildKinds.length > 0, mayHoldText: !allowedChildKinds.length || Boolean(kind.allowTextAlongsideChildren) };
  }) };
}
