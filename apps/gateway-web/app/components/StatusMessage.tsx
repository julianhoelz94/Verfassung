import type { ReactNode } from 'react';
import { T } from './TranslationProvider';
import { ui, type UiMessage } from '../../lib/messages';
import surfaceStyles from './surfaces.module.css';

type StatusMessageProps = {
  title: ReactNode;
  message: ReactNode;
  actionHref?: string;
  actionLabel?: ReactNode;
};

export function StatusMessage({ title, message, actionHref, actionLabel }: StatusMessageProps) {
  return (
    <section className={["status-panel card", surfaceStyles.card].join(' ')} role="status" aria-live="polite">
      <h1>{title}</h1>
      <p>{message}</p>
      {actionHref && actionLabel ? <a className="btn" href={actionHref}>{actionLabel}</a> : null}
    </section>
  );
}

export function ServiceUnavailable({ service, retryHref = '/' }: { service: UiMessage; retryHref?: string }) {
  return (
    <StatusMessage
      title={<><T value={service} /> <T value={ui.extraComponents.statusMessage.isUnavailable} /></>}
      message={<T value={ui.extraComponents.statusMessage.thisPageCouldNotLoad} />}
      actionHref={retryHref}
      actionLabel={<T value={ui.extraComponents.statusMessage.tryAgain} />}
    />
  );
}
