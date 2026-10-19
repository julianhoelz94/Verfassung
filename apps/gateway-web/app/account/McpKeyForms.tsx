'use client';

import { T } from '../components/TranslationProvider';
import { ui } from '../../lib/messages';
import { useFormState } from 'react-dom';
import { Alert, Button, Input } from '../components/ui';
import { createMcpKeyAction, rotateMcpKeyAction, type TokenRevealState } from './actions';

const initial: TokenRevealState = {};

function Reveal({ state }: { state: TokenRevealState }) {
  return <>
    {state.token ? <Alert tone="success"><T value={ui.account.mcpkeyforms.copyThisKeyNowItIsShown} />{" "}<code>{state.token}</code></Alert> : null}
    {state.error ? <Alert tone="error"><T value={ui.account.mcpkeyforms.theKeyActionFailedCheckYourRights} /></Alert> : null}
  </>;
}

export function CreateMcpKeyForm({ canImport }: { canImport: boolean }) {
  const [state, action] = useFormState(createMcpKeyAction, initial);
  return <>
    <Reveal state={state} />
    <form action={action} className="stack">
      <Input label={<T value={ui.attrs.accountMcpkeyformsInputLabelKeyName} />} id="mcp-key-name" name="name" required maxLength={100} />
      {canImport ? <label className="choice-row"><input type="checkbox" name="importEnabled" /> <T value={ui.account.mcpkeyforms.allowStagingConstitutionImports} /></label> : null}
      <Button variant="primary"><T value={ui.account.mcpkeyforms.createMcpKey} /></Button>
    </form>
  </>;
}

export function RotateMcpKeyForm({ keyId }: { keyId: string }) {
  const [state, action] = useFormState(rotateMcpKeyAction, initial);
  return <>
    <Reveal state={state} />
    <form action={action}><input type="hidden" name="keyId" value={keyId} /><Button><T value={ui.account.mcpkeyforms.rotate} /></Button></form>
  </>;
}
