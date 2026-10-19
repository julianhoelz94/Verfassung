'use client';

import { T, useTranslation } from '../../components/TranslationProvider';
import { ui } from '../../../lib/messages';
import { useState } from 'react';
import type { AnonymousBrowsingPolicy, AnonymousRate } from '../../../lib/anonymous-browsing-policy';
import { Button } from '../../components/ui';
import { saveAnonymousBrowsingAction } from './actions';

function RateFields({ prefix, label, rate, disabled }: { prefix: string; label: string; rate: AnonymousRate; disabled: boolean }) {
  return <fieldset disabled={disabled}>
    <legend>{label}</legend>
    <label><T value={ui.admin.anonymousBrowsing.anonymousbrowsingform.apiCalls} />{" "}<input name={`${prefix}Requests`} type="number" min={1} max={1000000} required defaultValue={rate.requests} />
    </label>
    <label><T value={ui.admin.anonymousBrowsing.anonymousbrowsingform.every} />{" "}<input name={`${prefix}WindowValue`} type="number" min={1} max={365} required defaultValue={rate.windowValue} />
    </label>
    <label><T value={ui.admin.anonymousBrowsing.anonymousbrowsingform.unit} />{" "}<select name={`${prefix}WindowUnit`} defaultValue={rate.windowUnit}>
        <option value="minutes"><T value={ui.admin.anonymousBrowsing.anonymousbrowsingform.minutes} /></option><option value="hours"><T value={ui.admin.anonymousBrowsing.anonymousbrowsingform.hours} /></option><option value="days"><T value={ui.admin.anonymousBrowsing.anonymousbrowsingform.days} /></option>
      </select>
    </label>
  </fieldset>;
}

export function AnonymousBrowsingForm({ policy }: { policy: AnonymousBrowsingPolicy }) {
  const t = useTranslation();
  const [allowed, setAllowed] = useState(policy.allowed);
  const displayed = (rate: AnonymousRate): AnonymousRate => allowed ? rate : { ...rate, requests: 0 };
  return <form action={saveAnonymousBrowsingAction}>
    <label><input type="checkbox" name="allowed" checked={allowed} onChange={(event) => setAllowed(event.target.checked)} /> <T value={ui.admin.anonymousBrowsing.anonymousbrowsingform.allowAnonymousBrowsing} /></label>
    <p className="muted"><T value={ui.admin.anonymousBrowsing.anonymousbrowsingform.whenOffAnonymousContentApiCallsAnd} /></p>
    {!allowed ? <p role="status"><T value={ui.admin.anonymousBrowsing.anonymousbrowsingform.effectiveRates0CallsPerIpAnd} /></p> : null}
    <RateFields key={`per-ip-${allowed}`} prefix="perIp" label={t(ui.accessibility.perIpAddress)} rate={displayed(policy.perIp)} disabled={!allowed} />
    <RateFields key={`total-${allowed}`} prefix="total" label={t(ui.accessibility.allAnonymousRequests)} rate={displayed(policy.total)} disabled={!allowed} />
    <Button variant="primary"><T value={ui.admin.anonymousBrowsing.anonymousbrowsingform.saveAnonymousBrowsing} /></Button>
  </form>;
}
