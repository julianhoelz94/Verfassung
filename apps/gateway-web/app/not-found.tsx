import { FocusedPage } from './components/layout/templates';
import { StatusMessage } from './components/StatusMessage';
import { T } from './components/TranslationProvider';
import { ui } from '../lib/messages';

export default function NotFound() {
  return (
    <FocusedPage width="reading">
      <StatusMessage
        title={<T value={ui.notFound.title} />}
        message={<T value={ui.notFound.message} />}
        actionHref="/"
        actionLabel={<T value={ui.notFound.backToCountries} />}
      />
    </FocusedPage>
  );
}
