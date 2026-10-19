import Image from 'next/image';
import { ui } from '../../lib/messages';
import { reviewUi } from '../../lib/ui-review-messages';
import { Disclosure } from './Disclosure';
import { T } from './TranslationProvider';

export function MfaSetup({ secret, qrDataUrl, qrLabel }: { secret: string; qrDataUrl: string | null; qrLabel: string }) {
  return <div className="mfa-setup">
    <p><T value={reviewUi.scanQr} /></p>
    {qrDataUrl ? <Image className="mfa-qr" src={qrDataUrl} alt={qrLabel} width={224} height={224} unoptimized /> : null}
    <Disclosure summary={<T value={reviewUi.cantScan} />} open={!qrDataUrl}>
      <p><T value={reviewUi.manualKey} /></p>
      <code className="setup-key">{secret}</code>
      <p className="muted"><T value={ui.account.page.theKeyIsShownOnlyDuringSetup} /></p>
    </Disclosure>
  </div>;
}
