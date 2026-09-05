import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react';

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary';
};

export function Button({ variant = 'secondary', className, type = 'submit', children, ...props }: ButtonProps) {
  return (
    <button type={type} className={['btn', `btn-${variant}`, className].filter(Boolean).join(' ')} {...props}>
      {children}
    </button>
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
