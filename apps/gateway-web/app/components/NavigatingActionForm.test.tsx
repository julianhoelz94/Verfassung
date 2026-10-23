import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { Simulate } from 'react-dom/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NavigatingActionForm } from './NavigatingActionForm';
import { TranslationProvider } from './TranslationProvider';

function Form({ action }: { action: (data: FormData) => Promise<string> }) {
  return <TranslationProvider locale="en"><NavigatingActionForm action={action}>
    <label>Authenticator code<input name="code" defaultValue="123456" /></label>
    <input type="hidden" name="next" value="/editor?status=approved" />
    <button>Continue</button>
  </NavigatingActionForm></TranslationProvider>;
}

describe('client action readiness', () => {
  let host: HTMLDivElement;
  let root: Root | undefined;
  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    host = document.createElement('div'); document.body.appendChild(host);
  });
  afterEach(async () => {
    if (root) await act(async () => root!.unmount());
    root = undefined; host.remove();
  });

  it('server-rendered controls cannot submit a native POST before hydration', () => {
    host.innerHTML = renderToString(<Form action={vi.fn()} />);
    expect(host.querySelector('form')?.getAttribute('aria-busy')).toBe('true');
    expect(host.querySelector('fieldset')?.disabled).toBe(true);
    expect(host.querySelector('input[name="code"]')?.matches(':disabled')).toBe(true);
    expect(host.querySelector('button')?.matches(':disabled')).toBe(true);
  });

  it('captures enabled fields, prevents repeated submits, and allows recovery after failure', async () => {
    let rejectAction: (reason?: unknown) => void = () => {};
    const action = vi.fn<(data: FormData) => Promise<string>>(() => new Promise<string>((_resolve, reject) => { rejectAction = reject; }));
    root = createRoot(host);
    await act(async () => root!.render(<Form action={action} />));
    const form = host.querySelector('form')!;
    const fieldset = host.querySelector('fieldset')!;
    expect(fieldset.disabled).toBe(false);
    await act(async () => Simulate.submit(form));
    expect(action).toHaveBeenCalledTimes(1);
    const data = action.mock.calls[0][0] as FormData;
    expect(data.get('code')).toBe('123456');
    expect(data.get('next')).toBe('/editor?status=approved');
    expect(fieldset.disabled).toBe(true);
    await act(async () => Simulate.submit(form));
    expect(action).toHaveBeenCalledTimes(1);
    await act(async () => rejectAction(new Error('Connection interrupted')));
    expect(fieldset.disabled).toBe(false);
    expect(form.getAttribute('aria-busy')).toBe('false');
    expect(host.querySelector('[role="alert"]')?.textContent).toBeTruthy();
    expect(host.querySelector<HTMLInputElement>('input[name="code"]')?.value).toBe('123456');
  });
});
