import { T } from './components/TranslationProvider';
import { ui } from '../lib/messages';
import { FocusedPage } from './components/layout/templates';

export default function Loading() {
  return (
    <FocusedPage width="reading">
      <p aria-live="polite"><T value={ui.loading.loading} /></p>
    </FocusedPage>
  );
}
