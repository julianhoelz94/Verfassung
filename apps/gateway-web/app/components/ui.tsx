import type { ButtonHTMLAttributes, CSSProperties, InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react';
import { Breadcrumbs } from './Breadcrumbs';

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost';
  size?: 'md' | 'sm';
};

export function Button({
  variant = 'secondary',
  size = 'md',
  className,
  type = 'submit',
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={['btn', `btn-${variant}`, size === 'sm' ? 'btn-sm' : undefined, className].filter(Boolean).join(' ')}
      {...props}
    >
      {children}
    </button>
  );
}

export type BadgeTone = 'accent' | 'added' | 'removed' | 'changed' | 'info' | 'neutral';

export function Badge({ tone = 'neutral', children }: { tone?: BadgeTone; children: ReactNode }) {
  return <span className={tone === 'neutral' ? 'badge' : `badge badge-${tone}`}>{children}</span>;
}

type ChipProps = {
  href?: string;
  active?: boolean;
  children: ReactNode;
};

export function Chip({ href, active, children }: ChipProps) {
  if (href) {
    return (
      <a href={href} className="chip" aria-current={active ? 'true' : undefined}>
        {children}
      </a>
    );
  }
  return <span className="chip">{children}</span>;
}

type PageHeaderProps = {
  breadcrumbs?: { href?: string; label: string }[];
  eyebrow?: string;
  title: ReactNode;
  meta?: ReactNode;
  actions?: ReactNode;
};

export function PageHeader({ breadcrumbs, eyebrow, title, meta, actions }: PageHeaderProps) {
  return (
    <div className="page-header">
      {breadcrumbs && breadcrumbs.length > 0 ? <Breadcrumbs items={breadcrumbs} /> : null}
      <div>
        {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
        <h1 className="page-title">{title}</h1>
        {meta ? <div className="page-meta">{meta}</div> : null}
      </div>
      {actions ? <div className="page-actions">{actions}</div> : null}
    </div>
  );
}

type PagerLink = { href: string; label: string };

export function Toolbar({ children, label }: { children: ReactNode; label: string }) {
  return (
    <div className="toolbar" role="toolbar" aria-label={label}>
      {children}
    </div>
  );
}

export function Pager({ previous, next }: { previous?: PagerLink; next?: PagerLink }) {
  if (!previous && !next) {
    return null;
  }
  return (
    <nav className="pager" aria-label="Pagination">
      {previous ? <a href={previous.href}>{previous.label}</a> : <span />}
      {next ? <a href={next.href}>{next.label}</a> : <span />}
    </nav>
  );
}

export function DataList({ columns = 4, children }: { columns?: number; children: ReactNode }) {
  const style = { ['--cols' as string]: String(columns) } as CSSProperties;
  return (
    <div className="data-list" style={style}>
      {children}
    </div>
  );
}

export function DataRow({ cells }: { cells: { label: string; value: ReactNode }[] }) {
  return (
    <div className="data-row">
      {cells.map((cell, index) => (
        <div key={`${cell.label}-${index}`}>
          <div className="k">{cell.label}</div>
          <div>{cell.value}</div>
        </div>
      ))}
    </div>
  );
}

type InputProps = InputHTMLAttributes<HTMLInputElement> & { label: string };

export function Input({ label, id, className, ...props }: InputProps) {
  const inputId = id ?? props.name;
  return (
    <label className="field" htmlFor={inputId}>
      <span className="field-label">{label}</span>
      <input id={inputId} className={['field-control', className].filter(Boolean).join(' ')} {...props} />
    </label>
  );
}

type TextAreaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & { label: string };

export function TextArea({ label, id, className, ...props }: TextAreaProps) {
  const inputId = id ?? props.name;
  return (
    <label className="field" htmlFor={inputId}>
      <span className="field-label">{label}</span>
      <textarea id={inputId} className={['field-control', className].filter(Boolean).join(' ')} {...props} />
    </label>
  );
}

type SelectProps = SelectHTMLAttributes<HTMLSelectElement> & { label: string; children: ReactNode };

export function Select({ label, id, className, children, ...props }: SelectProps) {
  const inputId = id ?? props.name;
  return (
    <label className="field" htmlFor={inputId}>
      <span className="field-label">{label}</span>
      <select id={inputId} className={['field-control', className].filter(Boolean).join(' ')} {...props}>
        {children}
      </select>
    </label>
  );
}

type AlertProps = {
  children: ReactNode;
  tone?: 'error' | 'info' | 'success';
};

export function Alert({ children, tone = 'info' }: AlertProps) {
  const role = tone === 'error' ? 'alert' : 'status';
  return (
    <p className={`alert alert-${tone}`} role={role} aria-live={tone === 'error' ? 'assertive' : 'polite'}>
      {children}
    </p>
  );
}

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <section className={['card', className].filter(Boolean).join(' ')}>{children}</section>;
}

const WORKFLOW_STEPS = ['Draft', 'In review', 'Approved', 'Published'] as const;

const WORKFLOW_INDEX: Record<string, number> = {
  open: 0,
  reviewing: 1,
  approved: 2,
  published: 3,
};

export function WorkflowSteps({ status }: { status: string }) {
  const current = WORKFLOW_INDEX[status] ?? 0;
  return (
    <div className="status-steps" aria-label="Workflow">
      <ol>
        {WORKFLOW_STEPS.map((label, index) => {
          const state = index < current ? 'is-done' : index === current ? 'is-current' : undefined;
          return (
            <li key={label} className={state}>
              {label}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
