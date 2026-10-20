'use client';

import { T } from './components/TranslationProvider';
import { ui } from '../lib/messages';
import { Disclosure } from './components/Disclosure';
import { reviewUi } from '../lib/ui-review-messages';
import Link from 'next/link';
import { FocusedPage } from './components/layout/templates';

type ErrorPageProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function ErrorPage({ error, reset }: ErrorPageProps) {
  return (
    <FocusedPage width="reading">
      <section className="status-panel" role="alert">
        <h1><T value={ui.error.somethingWentWrong} /></h1>
        <p><T value={ui.error.thisPageCouldNotBeShownOther} /></p>
        <Disclosure summary={<T value={reviewUi.technicalDetails} />}><p className="muted">{error.message}</p></Disclosure>
        <button type="button" onClick={() => reset()}>
          <T value={ui.error.tryAgain} />{" "}</button>{' '}
        <Link href="/"><T value={ui.error.countries} /></Link>
      </section>
    </FocusedPage>
  );
}
