'use client';

import { useId } from 'react';
import { AlertCircle } from 'lucide-react';

/** What a control needs to be wired to its label, hint and error. */
export interface FieldControlProps {
  id: string;
  'aria-describedby'?: string;
  'aria-invalid'?: true;
}

/**
 * Label + control + hint + error, wired together (`htmlFor`, `aria-describedby`,
 * `aria-invalid`) so errors are announced and sit next to the field they belong to.
 *
 *   <Field label="Client name" error={errors.name}>
 *     {(p) => <input {...p} className={clsx('input', errors.name && 'input-error')} … />}
 *   </Field>
 */
export function Field({
  label,
  hint,
  error,
  optional,
  className,
  children,
}: {
  label: React.ReactNode;
  hint?: React.ReactNode;
  error?: string | null;
  optional?: boolean;
  className?: string;
  children: (props: FieldControlProps) => React.ReactNode;
}) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy = [error ? errorId : null, hint ? hintId : null].filter(Boolean).join(' ') || undefined;
  return (
    <div className={className}>
      <label htmlFor={id} className="label">
        {label}
        {optional && <span className="ml-1 font-normal text-on-surface-variant">(optional)</span>}
      </label>
      {children({ id, 'aria-describedby': describedBy, ...(error ? { 'aria-invalid': true as const } : {}) })}
      {error && (
        <p id={errorId} role="alert" className="field-error">
          {error}
        </p>
      )}
      {hint && (
        <p id={hintId} className="field-hint">
          {hint}
        </p>
      )}
    </div>
  );
}

/** Form-level error (the request failed, not one field). Announced when it appears. */
export function FormError({ children }: { children: React.ReactNode }) {
  if (!children) return null;
  return (
    <div role="alert" className="flex items-start gap-2 rounded-lg border border-error/40 bg-error-container/50 px-3 py-2.5 text-sm text-on-error-container">
      <AlertCircle size={16} className="mt-0.5 flex-shrink-0" aria-hidden="true" />
      <p>{children}</p>
    </div>
  );
}
