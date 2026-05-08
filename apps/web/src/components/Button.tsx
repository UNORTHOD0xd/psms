import type { ButtonHTMLAttributes } from 'react';

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  loading?: boolean;
}

export function Button({
  variant = 'primary',
  loading,
  disabled,
  children,
  className,
  ...rest
}: Props): JSX.Element {
  const cls = ['psms-btn', `psms-btn--${variant}`, className].filter(Boolean).join(' ');
  return (
    <button
      type={rest.type ?? 'button'}
      className={cls}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? <span aria-live="polite">Working…</span> : children}
    </button>
  );
}
