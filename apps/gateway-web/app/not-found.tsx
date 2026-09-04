import { PageMain } from './components/PageMain';
import { StatusMessage } from './components/StatusMessage';

export default function NotFound() {
  return (
    <PageMain>
      <StatusMessage
        title="Page not found"
        message="That country, version, or article is not in the catalog. It is missing, not a service outage."
        actionHref="/"
        actionLabel="Back to countries"
      />
    </PageMain>
  );
}
