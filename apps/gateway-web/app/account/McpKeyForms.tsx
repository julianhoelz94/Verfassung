'use client';

import { useFormState } from 'react-dom';
import { Alert, Button, Input } from '../components/ui';
import { createMcpKeyAction, rotateMcpKeyAction, type TokenRevealState } from './actions';

const initial: TokenRevealState = {};

function Reveal({ state }: { state: TokenRevealState }) {
  return <>
    {state.token ? <Alert tone="success">Copy this key now. It is shown once: <code>{state.token}</code></Alert> : null}
    {state.error ? <Alert tone="error">The key action failed. Check your rights and recent authenticator confirmation.</Alert> : null}
  </>;
}

export function CreateMcpKeyForm({ canImport }: { canImport: boolean }) {
  const [state, action] = useFormState(createMcpKeyAction, initial);
  return <>
    <Reveal state={state} />
    <form action={action}>
      <Input label="Key name" id="mcp-key-name" name="name" required maxLength={100} />
      {canImport ? <label><input type="checkbox" name="importEnabled" /> Allow staging constitution imports</label> : null}
      <Button variant="primary">Create MCP key</Button>
    </form>
  </>;
}

export function RotateMcpKeyForm({ keyId }: { keyId: string }) {
  const [state, action] = useFormState(rotateMcpKeyAction, initial);
  return <>
    <Reveal state={state} />
    <form action={action}><input type="hidden" name="keyId" value={keyId} /><Button>Rotate</Button></form>
  </>;
}
