'use client';

import { T, ui } from './components/TranslationProvider';
import Link from 'next/link';
import { PageMain } from './components/PageMain';

type ErrorPageProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function ErrorPage({ error, reset }: ErrorPageProps) {
  return (
    <PageMain>
      <section className="status-panel" role="alert">
        <h1><T value={ui.error.somethingWentWrong} /></h1>
        <p><T value={ui.error.thisPageCouldNotBeShownOther} /></p>
        <p className="muted">{error.message}</p>
        <button type="button" onClick={() => reset()}>
          <T value={ui.error.tryAgain} />{" "}</button>{' '}
        <Link href="/"><T value={ui.error.countries} /></Link>
      </section>
    </PageMain>
  );
}
