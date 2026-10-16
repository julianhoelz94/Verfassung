import { T, ui } from './components/TranslationProvider';
import { PageMain } from './components/PageMain';

export default function Loading() {
  return (
    <PageMain>
      <p aria-live="polite"><T value={ui.loading.loading} /></p>
    </PageMain>
  );
}
