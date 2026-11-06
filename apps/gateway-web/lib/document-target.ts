import type { MaterialTarget } from './document-api';

export type EditableDocumentTarget = 'constitution' | 'version' | 'amendment' | MaterialTarget;
export function isMaterialTarget(target: string): target is MaterialTarget {
  return ['amendment_material', 'change_material', 'lifecycle_material'].includes(target);
}
export function editableDocumentTarget(target: string): target is EditableDocumentTarget {
  return ['constitution', 'version', 'amendment'].includes(target) || isMaterialTarget(target);
}
export function canChangeDocumentLinks(roles: readonly string[], target: EditableDocumentTarget): boolean {
  const role = target === 'lifecycle_material' ? 'publisher' : 'editor';
  return roles.includes('admin') || roles.includes(role);
}
