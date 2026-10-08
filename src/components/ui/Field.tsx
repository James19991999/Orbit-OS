'use client';
import { forwardRef, useId } from 'react';
import { cn } from './cn';

const control = 'w-full rounded border border-outline-variant bg-surface-container-lowest px-3 text-body-md text-on-surface placeholder:text-outline focus:border-primary-container focus:outline-none focus:shadow-focus disabled:opacity-60';

interface FieldShell { label: string; hint?: string; error?: string; hideLabel?: boolean; className?: string }

function Shell({ id, label, hint, error, hideLabel, className, children }: FieldShell & { id: string; children: React.ReactNode }) {
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <label htmlFor={id} className={cn('text-label-sm text-on-surface-variant', hideLabel && 'sr-only')}>{label}</label>
      {children}
      {hint && !error && <p id={`${id}-hint`} className="text-body-sm text-on-surface-variant">{hint}</p>}
      {error && <p id={`${id}-error`} role="alert" className="text-body-sm text-alert">{error}</p>}
    </div>
  );
}

export const Input = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement> & FieldShell>(function Input(
  { label, hint, error, hideLabel, className, id, ...rest }, ref,
) {
  const auto = useId();
  const fid = id ?? auto;
  return (
    <Shell id={fid} label={label} hint={hint} error={error} hideLabel={hideLabel} className={className}>
      <input ref={ref} id={fid} className={cn(control, 'h-11 md:h-10')} aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${fid}-error` : hint ? `${fid}-hint` : undefined} {...rest} />
    </Shell>
  );
});

export const Textarea = forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement> & FieldShell>(function Textarea(
  { label, hint, error, hideLabel, className, id, rows = 3, ...rest }, ref,
) {
  const auto = useId();
  const fid = id ?? auto;
  return (
    <Shell id={fid} label={label} hint={hint} error={error} hideLabel={hideLabel} className={className}>
      <textarea ref={ref} id={fid} rows={rows} className={cn(control, 'py-2')} aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${fid}-error` : hint ? `${fid}-hint` : undefined} {...rest} />
    </Shell>
  );
});

export const Select = forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement> & FieldShell & { options: { value: string; label: string }[] }>(function Select(
  { label, hint, error, hideLabel, className, id, options, ...rest }, ref,
) {
  const auto = useId();
  const fid = id ?? auto;
  return (
    <Shell id={fid} label={label} hint={hint} error={error} hideLabel={hideLabel} className={className}>
      <select ref={ref} id={fid} className={cn(control, 'h-11 md:h-10')} aria-invalid={error ? true : undefined} {...rest}>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </Shell>
  );
});

export function Checkbox({ label, description, className, ...rest }: React.InputHTMLAttributes<HTMLInputElement> & { label: string; description?: string }) {
  const id = useId();
  return (
    <div className={cn('flex items-start gap-3', className)}>
      <input id={id} type="checkbox" className="mt-0.5 h-5 w-5 shrink-0 accent-[#2563eb] md:h-4 md:w-4" {...rest} />
      <label htmlFor={id} className="text-body-md text-on-surface">
        {label}
        {description && <span className="block text-body-sm text-on-surface-variant">{description}</span>}
      </label>
    </div>
  );
}

export function Switch({ checked, onChange, label, description, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; description?: string; disabled?: boolean }) {
  const id = useId();
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <span id={`${id}-l`} className="text-label-md text-on-surface">{label}</span>
        {description && <p id={`${id}-d`} className="text-body-sm text-on-surface-variant">{description}</p>}
      </div>
      <button type="button" role="switch" aria-checked={checked} aria-labelledby={`${id}-l`} aria-describedby={description ? `${id}-d` : undefined}
        disabled={disabled} onClick={() => onChange(!checked)}
        className={cn('relative h-6 w-11 shrink-0 rounded-full border p-0 transition-colors disabled:opacity-50',
          checked ? 'border-primary-container bg-primary-container' : 'border-outline-variant bg-surface-container-highest')}>
        <span className={cn('absolute left-0.5 top-0.5 h-[18px] w-[18px] rounded-full bg-white shadow transition-transform', checked ? 'translate-x-5' : 'translate-x-0')} aria-hidden />
      </button>
    </div>
  );
}
