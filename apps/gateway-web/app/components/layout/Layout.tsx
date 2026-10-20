import {
  createElement,
  type ComponentPropsWithoutRef,
  type ComponentPropsWithRef,
  type ElementType,
  type ReactNode,
} from 'react';
import styles from './layout.module.css';

export type LayoutGap = 'related' | 'control' | 'field' | 'card' | 'section';
type LayoutProps<T extends ElementType> = {
  as?: T;
  gap?: LayoutGap;
  className?: string;
  children?: ReactNode;
  elementRef?: ComponentPropsWithRef<T>['ref'];
} & Omit<ComponentPropsWithoutRef<NoInfer<T>>, 'as' | 'gap' | 'className' | 'children'>;

function classes(...values: Array<string | undefined>) {
  return values.filter(Boolean).join(' ');
}

/** Owns the space between children. Children retain ownership of their padding. */
export function Stack<T extends ElementType = 'div'>({
  as,
  gap = 'field',
  className,
  elementRef,
  ...props
}: LayoutProps<T>) {
  return createElement(as ?? 'div', {
    ...props,
    ref: elementRef,
    className: classes(styles.stack, styles[gap], className),
  });
}

type InlineProps<T extends ElementType> = LayoutProps<T> & { align?: 'start' | 'center' | 'end' | 'baseline' };

export function Inline<T extends ElementType = 'div'>({
  as,
  gap = 'control',
  align = 'center',
  className,
  elementRef,
  ...props
}: InlineProps<T>) {
  return createElement(as ?? 'div', {
    ...props,
    ref: elementRef,
    className: classes(styles.inline, styles[gap], styles[`align-${align}`], className),
  });
}

type GridProps<T extends ElementType> = LayoutProps<T> & { columns?: 2 | 3; variant?: 'cards' | 'form' };

export function Grid<T extends ElementType = 'div'>({
  as,
  gap = 'card',
  columns = 3,
  variant = 'cards',
  className,
  elementRef,
  ...props
}: GridProps<T>) {
  return createElement(as ?? 'div', {
    ...props,
    ref: elementRef,
    className: classes(
      styles.grid,
      styles[gap],
      styles[`columns${columns}`],
      variant === 'form' ? styles.form : undefined,
      className,
    ),
  });
}

type SectionProps = Omit<ComponentPropsWithoutRef<'section'>, 'title'> & {
  title: ReactNode;
  description?: ReactNode;
  headingLevel?: 'h2' | 'h3';
};

export function Section({ title, description, headingLevel = 'h2', children, className, ...props }: SectionProps) {
  return (
    <Stack as="section" gap="field" className={className} {...props}>
      <Stack gap="related">
        {createElement(headingLevel, null, title)}
        {description ? <p className="muted">{description}</p> : null}
      </Stack>
      {children}
    </Stack>
  );
}
