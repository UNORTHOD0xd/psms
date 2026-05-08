// Form field with a visible label, optional hint, and per-field error.
// CLAUDE.md frontend rule 5: every interactive element has an
// accessible name; forms have visible labels (not just placeholders).
//
// Field and TextAreaField use React.forwardRef so that React Hook Form's
// `register('name')` ref reaches the underlying <input> / <textarea>.
// Without forwardRef, spreading `{...register('email')}` would land
// `name`/`onChange`/`onBlur` on the wrapper but React would swallow the
// `ref`, leaving RHF unable to read the value at submit (manifests as
// permanent "Required" errors even after the user types).

import type {
  InputHTMLAttributes,
  ReactNode,
  TextareaHTMLAttributes,
} from 'react';
import { forwardRef, useId } from 'react';

interface BaseProps {
  label: string;
  hint?: string;
  error?: string;
  children?: ReactNode;
}

export function FieldShell({ label, hint, error, children }: BaseProps): JSX.Element {
  return (
    <div className={`psms-field${error ? ' psms-field--error' : ''}`}>
      <label className="psms-field__label">
        <span className="psms-field__label-text">{label}</span>
        {children}
      </label>
      {hint ? (
        <p className="psms-field__hint" id={`${label}-hint`}>
          {hint}
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="psms-field__error">
          {error}
        </p>
      ) : null}
    </div>
  );
}

type InputProps = InputHTMLAttributes<HTMLInputElement> & BaseProps;

export const Field = forwardRef<HTMLInputElement, InputProps>(function Field(
  props,
  ref,
) {
  const { label, hint, error, ...inputProps } = props;
  const id = useId();
  const describedBy = [hint ? `${id}-hint` : null, error ? `${id}-err` : null]
    .filter(Boolean)
    .join(' ');
  return (
    <div className={`psms-field${error ? ' psms-field--error' : ''}`}>
      <label htmlFor={id} className="psms-field__label-text">
        {label}
      </label>
      <input
        id={id}
        ref={ref}
        aria-invalid={Boolean(error) || undefined}
        aria-describedby={describedBy || undefined}
        {...inputProps}
      />
      {hint ? (
        <p className="psms-field__hint" id={`${id}-hint`}>
          {hint}
        </p>
      ) : null}
      {error ? (
        <p role="alert" id={`${id}-err`} className="psms-field__error">
          {error}
        </p>
      ) : null}
    </div>
  );
});

type TextAreaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & BaseProps;

export const TextAreaField = forwardRef<HTMLTextAreaElement, TextAreaProps>(
  function TextAreaField(props, ref) {
    const { label, hint, error, ...areaProps } = props;
    const id = useId();
    const describedBy = [hint ? `${id}-hint` : null, error ? `${id}-err` : null]
      .filter(Boolean)
      .join(' ');
    return (
      <div className={`psms-field${error ? ' psms-field--error' : ''}`}>
        <label htmlFor={id} className="psms-field__label-text">
          {label}
        </label>
        <textarea
          id={id}
          ref={ref}
          aria-invalid={Boolean(error) || undefined}
          aria-describedby={describedBy || undefined}
          {...areaProps}
        />
        {hint ? (
          <p className="psms-field__hint" id={`${id}-hint`}>
            {hint}
          </p>
        ) : null}
        {error ? (
          <p role="alert" id={`${id}-err`} className="psms-field__error">
            {error}
          </p>
        ) : null}
      </div>
    );
  },
);
