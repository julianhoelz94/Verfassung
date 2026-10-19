import { ui, type UiMessage } from './messages';
import { reviewUi } from './ui-review-messages';

export function changeTypeMessage(changeType: string): UiMessage {
  switch (changeType) {
    case 'added': return ui.remainingStatus.added;
    case 'changed': return ui.remainingStatus.changed;
    case 'removed': return ui.remainingStatus.removed;
    default: return ui.remainingStatus.unknown;
  }
}

export function builtinKindMessage(kind: string): UiMessage | null {
  switch (kind.toLowerCase()) {
    case 'article': return ui.contentKinds.article;
    case 'paragraph': return ui.contentKinds.paragraph;
    case 'sentence': return ui.contentKinds.sentence;
    case 'section': return ui.contentKinds.section;
    case 'subsection': return ui.contentKinds.subsection;
    case 'chapter': return ui.contentKinds.chapter;
    case 'part': return ui.contentKinds.part;
    default: return null;
  }
}

export function roleMessage(role: string): UiMessage {
  switch (role) {
    case 'admin': return ui.accountState.admin;
    case 'editor': return ui.accountState.editor;
    case 'reviewer': return ui.accountState.reviewer;
    case 'publisher': return ui.accountState.publisher;
    case 'viewer': return ui.accountState.viewer;
    default: return ui.remainingStatus.unknown;
  }
}

export function statusMessage(status: string | null | undefined): UiMessage {
  switch (status) {
    case 'active': return ui.remainingStatus.active;
    case 'disabled': return ui.accountState.disabled;
    case 'invited': return ui.accountState.invited;
    case 'pending_confirmation': return ui.accountState.pendingConfirmation;
    case 'open':
    case 'draft': return ui.workflow.draft;
    case 'reviewing':
    case 'pending_review': return ui.workflow.inReview;
    case 'approved': return ui.workflow.approved;
    case 'published': return ui.workflow.published;
    case 'withdrawn': return ui.accountState.withdrawn;
    case 'rejected': return ui.accountState.rejected;
    case 'cancelled': return ui.accountState.cancelled;
    case 'archived': return ui.remainingStatus.archived;
    case 'prepared': return ui.importState.prepared;
    case 'outline_confirmed': return ui.importState.outlineConfirmed;
    case 'proposed': return reviewUi.structureProposed;
    case 'confirming': return reviewUi.structureConfirming;
    case 'confirmed': return reviewUi.structureConfirmed;
    case 'pending': return ui.importState.pending;
    case 'processing': return ui.importState.processing;
    case 'completed': return ui.importState.completed;
    case 'failed': return ui.importState.failed;
    default: return ui.remainingStatus.unknown;
  }
}
