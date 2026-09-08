import { LockKeyhole } from 'lucide-react';
import type { ReactNode } from 'react';
import { Icons } from '@/components/common';
import { cn } from '@/lib/utils';

/** Legend for the lock icon shown on this step's calculated/taken-over
 *  fields — only rendered (inline, next to the step-progress text in the
 *  sticky bar) on steps that actually have such fields. */
export function DetailFieldLegend() {
  return (
    <span className="inline-flex items-center gap-1.5 text-muted-foreground">
      <LockKeyhole size={13} aria-hidden="true" />
      Berechnet oder übernommen
    </span>
  );
}

export function ReadOnlyField({
  label,
  value,
  suffix,
  helperText,
  emphasis = false,
  align = 'left',
  className,
}: {
  label?: string;
  value: string;
  suffix?: string;
  helperText?: string;
  emphasis?: boolean;
  align?: 'left' | 'right';
  className?: string;
}) {
  return (
    <div className={cn('w-full min-w-0', className)}>
      {label && (
        <div className="mb-2 flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
          <span>{label}</span>
          <LockKeyhole size={13} aria-hidden="true" />
        </div>
      )}
      <div
        className={cn(
          // px-4/py-2 match the editable fields' padding exactly (rather than
          // a fixed min-height) so a read-only field sits at the same height
          // as an editable one beside it, with no hover/focus state of its own.
          'flex items-center gap-3 rounded-md border border-primary/20 bg-primary/5 px-4 py-2 text-foreground',
          align === 'right' && 'justify-end text-right',
          emphasis && 'font-semibold',
        )}
      >
        <output className="min-w-0 flex-1 break-words">{value || '-'}</output>
        {suffix && <span className="shrink-0 text-muted-foreground">{suffix}</span>}
        {!label && <LockKeyhole className="shrink-0 text-muted-foreground" size={14} aria-hidden="true" />}
      </div>
      {helperText && (
        <p className="mt-1.5 flex items-start gap-1.5 text-xs leading-5 text-muted-foreground">
          <Icons.Info className="mt-0.5 shrink-0" size={13} aria-hidden="true" />
          <span>{helperText}</span>
        </p>
      )}
    </div>
  );
}

export function MetricCard({
  label,
  value,
  detail,
  tone = 'neutral',
}: {
  label: string;
  value: string;
  detail?: string;
  tone?: 'neutral' | 'positive' | 'warning';
}) {
  return (
    <div className="min-w-0 rounded-md border border-primary/15 bg-card p-4 shadow-sm">
      <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <span>{label}</span>
        <LockKeyhole size={13} aria-hidden="true" />
      </div>
      <output className="mt-2 block break-words text-2xl font-semibold text-foreground">{value || '-'}</output>
      {detail && (
        <p
          className={cn(
            'mt-1.5 text-sm font-medium leading-5',
            tone === 'positive' && 'text-success',
            tone === 'warning' && 'text-warning',
            tone === 'neutral' && 'text-muted-foreground',
          )}
        >
          {detail}
        </p>
      )}
    </div>
  );
}

export function CalculatedPanel({
  title = 'Berechnete Werte',
  description = 'Automatisch aus Ihren Angaben ermittelt',
  children,
}: {
  title?: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="border-y border-primary/20 bg-primary/5 px-4 py-5 sm:px-6">
      <div className="mb-5 flex items-start gap-3">
        <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
          <LockKeyhole size={18} aria-hidden="true" />
        </span>
        <div>
          <h2 className="text-lg font-semibold text-foreground">{title}</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>
        </div>
      </div>
      {children}
    </section>
  );
}
