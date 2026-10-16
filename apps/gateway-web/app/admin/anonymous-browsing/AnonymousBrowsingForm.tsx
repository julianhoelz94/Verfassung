'use client';

import { useState } from 'react';
import type { AnonymousBrowsingPolicy, AnonymousRate } from '../../../lib/anonymous-browsing-policy';
import { Button } from '../../components/ui';
import { saveAnonymousBrowsingAction } from './actions';

function RateFields({ prefix, label, rate, disabled }: { prefix: string; label: string; rate: AnonymousRate; disabled: boolean }) {
  return <fieldset disabled={disabled}>
    <legend>{label}</legend>
    <label>API calls
      <input name={`${prefix}Requests`} type="number" min={1} max={1000000} required defaultValue={rate.requests} />
    </label>
    <label>Every
      <input name={`${prefix}WindowValue`} type="number" min={1} max={365} required defaultValue={rate.windowValue} />
    </label>
    <label>Unit
      <select name={`${prefix}WindowUnit`} defaultValue={rate.windowUnit}>
        <option value="minutes">Minutes</option><option value="hours">Hours</option><option value="days">Days</option>
      </select>
    </label>
  </fieldset>;
}

export function AnonymousBrowsingForm({ policy }: { policy: AnonymousBrowsingPolicy }) {
  const [allowed, setAllowed] = useState(policy.allowed);
  const displayed = (rate: AnonymousRate): AnonymousRate => allowed ? rate : { ...rate, requests: 0 };
  return <form action={saveAnonymousBrowsingAction}>
    <label><input type="checkbox" name="allowed" checked={allowed} onChange={(event) => setAllowed(event.target.checked)} /> Allow anonymous browsing</label>
    <p className="muted">When off, anonymous content API calls and browsing pages are unavailable. Your saved limits return when you enable browsing again.</p>
    {!allowed ? <p role="status">Effective rates: 0 calls per IP and 0 calls in total.</p> : null}
    <RateFields key={`per-ip-${allowed}`} prefix="perIp" label="Per IP address" rate={displayed(policy.perIp)} disabled={!allowed} />
    <RateFields key={`total-${allowed}`} prefix="total" label="All anonymous requests combined" rate={displayed(policy.total)} disabled={!allowed} />
    <Button variant="primary">Save anonymous browsing</Button>
  </form>;
}
