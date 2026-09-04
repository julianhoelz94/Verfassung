type StatusMessageProps = {
  title: string;
  message: string;
  actionHref?: string;
  actionLabel?: string;
};

export function StatusMessage({ title, message, actionHref, actionLabel }: StatusMessageProps) {
  return (
    <section className="status-panel" role="status" aria-live="polite">
      <h1>{title}</h1>
      <p>{message}</p>
      {actionHref && actionLabel ? <a href={actionHref}>{actionLabel}</a> : null}
    </section>
  );
}

export function ServiceUnavailable({ service, retryHref = '/' }: { service: string; retryHref?: string }) {
  return (
    <StatusMessage
      title={`${service} is unavailable`}
      message="This page could not load data from that service. The rest of the site is still available."
      actionHref={retryHref}
      actionLabel="Try again"
    />
  );
}
