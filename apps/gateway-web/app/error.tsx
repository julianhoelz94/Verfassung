'use client';

import { PageMain } from './components/PageMain';

type ErrorPageProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function ErrorPage({ error, reset }: ErrorPageProps) {
  return (
    <PageMain>
      <section className="status-panel" role="alert">
        <h1>Something went wrong</h1>
        <p>This page could not be shown. Other pages on the site still work.</p>
        <p className="muted">{error.message}</p>
        <button type="button" onClick={() => reset()}>
          Try again
        </button>{' '}
        <a href="/">Countries</a>
      </section>
    </PageMain>
  );
}
