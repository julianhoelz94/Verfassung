import type { ButtonHTMLAttributes, CSSProperties, InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react';
import { Breadcrumbs } from './Breadcrumbs';
import { SettingInfo, type SettingChangeability } from './SettingInfo';
import { LocalizedRegion } from './LocalizedRegion';
import { ui } from '../../lib/messages';
import { T } from './TranslationProvider';
import { useId } from 'react';
import fieldStyles from './fields.module.css';
import surfaceStyles from './surfaces.module.css';
import headerStyles from './header.module.css';

type FieldInfo = { description: ReactNode; changeability: SettingChangeability; changeNote?: ReactNode };

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
  breadcrumbs?: { href?: string; label: ReactNode }[];
  eyebrow?: ReactNode;
  title: ReactNode;
  meta?: ReactNode;
  actions?: ReactNode;
};

export function PageHeader({ breadcrumbs, eyebrow, title, meta, actions }: PageHeaderProps) {
  return (
    <div className={`page-header ${headerStyles.header}`}>
      <div className={headerStyles.heading}>
        {breadcrumbs && breadcrumbs.length > 0 ? <Breadcrumbs items={breadcrumbs} /> : null}
        {eyebrow ? <p className={headerStyles.eyebrow}>{eyebrow}</p> : null}
        <h1 className={`page-title ${headerStyles.title}`}>{title}</h1>
        {meta ? <div className={`page-meta ${headerStyles.meta}`}>{meta}</div> : null}
      </div>
      {actions ? <div className={`page-actions ${headerStyles.actions}`}>{actions}</div> : null}
    </div>
  );
}

type PagerLink = { href: string; label: ReactNode };

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
    <LocalizedRegion as="nav" className="pager" label={ui.accessibilityDynamic.pagination}>
      {previous ? <a href={previous.href}>{previous.label}</a> : <span />}
      {next ? <a href={next.href}>{next.label}</a> : <span />}
    </LocalizedRegion>
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

export function DataRow({ cells }: { cells: { label: ReactNode; value: ReactNode }[] }) {
  return (
    <div className="data-row">
      {cells.map((cell, index) => (
        <div key={index}>
          <div className="k">{cell.label}</div>
          <div>{cell.value}</div>
        </div>
      ))}
    </div>
  );
}

type FieldProps = { label: ReactNode; info?: FieldInfo; help?: ReactNode; error?: ReactNode };

function Field({ label, info, help, error, id, children }: FieldProps & { id: string; children: ReactNode }) {
  return <div className={`field ${fieldStyles.field}`}>
    <div className={fieldStyles.labelRow}>
      <label className={`field-label ${fieldStyles.label}`} htmlFor={id}>{label}</label>
      {info ? <SettingInfo label={label} {...info} /> : null}
    </div>
    {children}
    {help || error ? <div className={fieldStyles.messages}>
      {help ? <p id={`${id}-help`} className={fieldStyles.hint}>{help}</p> : null}
      {error ? <p id={`${id}-error`} className={fieldStyles.error}>{error}</p> : null}
    </div> : null}
  </div>;
}

function descriptions(id: string, help: ReactNode, error: ReactNode, existing?: string) {
  return [existing, help ? `${id}-help` : undefined, error ? `${id}-error` : undefined].filter(Boolean).join(' ') || undefined;
}

type InputProps = InputHTMLAttributes<HTMLInputElement> & FieldProps;

export function Input({ label, id, className, info, help, error, ...props }: InputProps) {
  const generatedId = useId();
  const inputId = id ?? props.name ?? generatedId;
  return <Field id={inputId} label={label} info={info} help={help} error={error}>
    <input {...props} id={inputId} className={['field-control', fieldStyles.control, className].filter(Boolean).join(' ')}
      aria-invalid={error ? true : props['aria-invalid']} aria-describedby={descriptions(inputId, help, error, props['aria-describedby'])} />
  </Field>;
}

type TextAreaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & FieldProps;

export function TextArea({ label, id, className, info, help, error, ...props }: TextAreaProps) {
  const generatedId = useId();
  const inputId = id ?? props.name ?? generatedId;
  return <Field id={inputId} label={label} info={info} help={help} error={error}>
    <textarea {...props} id={inputId} className={['field-control', fieldStyles.control, className].filter(Boolean).join(' ')}
      aria-invalid={error ? true : props['aria-invalid']} aria-describedby={descriptions(inputId, help, error, props['aria-describedby'])} />
  </Field>;
}

type SelectProps = SelectHTMLAttributes<HTMLSelectElement> & FieldProps;

export function Select({ label, id, className, children, info, help, error, ...props }: SelectProps) {
  const generatedId = useId();
  const inputId = id ?? props.name ?? generatedId;
  return <Field id={inputId} label={label} info={info} help={help} error={error}>
    <select {...props} id={inputId} className={['field-control', fieldStyles.control, className].filter(Boolean).join(' ')}
      aria-invalid={error ? true : props['aria-invalid']} aria-describedby={descriptions(inputId, help, error, props['aria-describedby'])}>{children}</select>
  </Field>;
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

export function Card({ children, className, id }: { children: ReactNode; className?: string; id?: string }) {
  return <section id={id} className={['card', surfaceStyles.card, className].filter(Boolean).join(' ')}>{children}</section>;
}

const WORKFLOW_STEPS = [ui.workflow.draft, ui.workflow.inReview, ui.workflow.approved, ui.workflow.published] as const;

const WORKFLOW_INDEX: Record<string, number> = {
  open: 0,
  reviewing: 1,
  approved: 2,
  published: 3,
};

export function WorkflowSteps({ status }: { status: string }) {
  const current = WORKFLOW_INDEX[status] ?? 0;
  return (
    <LocalizedRegion as="div" className="status-steps" label={ui.accessibilityDynamic.workflow}>
      <ol>
        {WORKFLOW_STEPS.map((label, index) => {
          const state = index < current ? 'is-done' : index === current ? 'is-current' : undefined;
          return (
            <li key={label.en} className={state}>
              <T value={label} />
            </li>
          );
        })}
      </ol>
    </LocalizedRegion>
  );
}
