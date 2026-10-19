import { ui, type UiMessage } from './messages';

export function lifecycleStatusMessage(status: string | null | undefined): UiMessage {
  switch (status) {
    case 'in_force': return ui.lifecycle.inForce;
    case 'awaiting_commencement': return ui.lifecycle.awaitingCommencement;
    case 'suspended': return ui.lifecycle.suspended;
    case 'uncertain': return ui.lifecycle.uncertain;
    case 'repealed': return ui.lifecycle.repealed;
    default: return ui.lifecycle.notRecorded;
  }
}
