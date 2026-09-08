"use client";

import { useId } from "react";

interface FieldIdsOptions {
  /** Caller-supplied id, if any — wins over the generated one. */
  id?: string;
  error?: string;
  helperText?: string;
  /** Caller-supplied aria-describedby, merged in front of ours. */
  describedBy?: string;
}

interface FieldIds {
  /** Put on the control; pair with `htmlFor` on the visible label. */
  controlId: string;
  /** Put on the error `<p>` — only rendered when `error` is set. */
  errorId: string;
  /** Put on the helper `<p>` — only rendered when it is visible. */
  helperId: string;
  /** Ready-made `aria-describedby` value, or undefined when there is nothing to describe. */
  describedBy: string | undefined;
  /** Ready-made `aria-invalid` value — `true` or undefined, never `false`. */
  invalid: true | undefined;
}

/**
 * Shared id/ARIA plumbing for the form field components.
 *
 * `useId` is deliberate: ids must survive hydration (server and client have to
 * agree) and re-renders (a label whose `htmlFor` changes every render stops
 * pointing at its control). Random or counter-based ids break both.
 */
export function useFieldIds({ id, error, helperText, describedBy }: FieldIdsOptions): FieldIds {
  const generatedId = useId();
  const controlId = id ?? generatedId;
  const errorId = `${controlId}-error`;
  const helperId = `${controlId}-helper`;

  return {
    controlId,
    errorId,
    helperId,
    describedBy: [
      describedBy,
      error ? errorId : null,
      helperText && !error ? helperId : null,
    ].filter(Boolean).join(" ") || undefined,
    invalid: error ? true : undefined,
  };
}

/**
 * Shared label renderer for the form field components — mandatory fields
 * show just the plain label (no asterisk); optional ones get a muted
 * "(optional)" suffix instead, so the two states read consistently
 * everywhere instead of each page inventing its own marker.
 */
export function FieldLabel({
  label,
  optional,
  htmlFor,
  className,
}: {
  label: string;
  optional?: boolean;
  htmlFor: string;
  className: string;
}) {
  return (
    <label htmlFor={htmlFor} className={className}>
      {label}
      {optional && <span className="font-normal text-muted-foreground"> (optional)</span>}
    </label>
  );
}
