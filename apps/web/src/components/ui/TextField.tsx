"use client";

import React from "react";
import { cn } from "@/lib/utils";
import { FieldLabel, useFieldIds } from "./fieldIds";

interface TextFieldProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helperText?: string;
  suffix?: string;
  /** Renders the suffix as a small rounded badge instead of plain muted
   *  text — for fields where the unit deserves more visual weight. */
  pillSuffix?: boolean;
  /** Appends a muted "(optional)" to the label instead of the mandatory
   *  default (no marker). */
  optional?: boolean;
  /** Icon rendered inside the field, left-aligned (e.g. Mail/Lock on a
   *  login form) — automatically reserves left padding for it. */
  icon?: React.ReactNode;
  /** Interactive element anchored to the right edge, inside the field (e.g.
   *  a show/hide-password toggle) — automatically reserves right padding.
   *  Unlike `suffix` (plain, non-interactive text), this can hold a button. */
  endElement?: React.ReactNode;
}

export function TextField({
  label,
  error,
  helperText,
  suffix,
  pillSuffix,
  optional,
  icon,
  endElement,
  className,
  readOnly,
  disabled,
  id,
  "aria-describedby": ariaDescribedBy,
  ...props
}: TextFieldProps) {
  const { controlId, errorId, helperId, describedBy, invalid } = useFieldIds({
    id,
    error,
    helperText,
    describedBy: ariaDescribedBy,
  });

  return (
    <div className="w-full">
      {label && (
        <FieldLabel label={label} optional={optional} htmlFor={controlId} className="mb-2 block text-sm font-medium text-foreground" />
      )}
      <div className="relative">
        {icon && (
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none [&>svg]:w-4 [&>svg]:h-4">
            {icon}
          </span>
        )}
        <input
          id={controlId}
          aria-invalid={invalid}
          aria-describedby={describedBy}
          className={cn(
            "w-full rounded-md border border-primary/30 bg-card px-4 py-2 shadow-sm",
            "hover:border-primary/55 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20",
            "transition-[border-color,box-shadow,background-color] duration-150",
            "read-only:border-primary/20 read-only:bg-primary/5 read-only:shadow-none read-only:hover:border-primary/20 read-only:focus:ring-0",
            "disabled:cursor-not-allowed disabled:border-border disabled:bg-muted disabled:text-muted-foreground disabled:shadow-none disabled:hover:border-border",
            error && "border-destructive focus:ring-destructive/50",
            icon && "pl-10",
            (suffix || endElement) && "pr-12",
            className
          )}
          readOnly={readOnly}
          disabled={disabled}
          {...props}
        />
        {suffix && (
          pillSuffix ? (
            <span className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground pointer-events-none">
              {suffix}
            </span>
          ) : (
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none">
              {suffix}
            </span>
          )
        )}
        {endElement && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2">
            {endElement}
          </span>
        )}
      </div>
      {error && (
        <p id={errorId} role="alert" className="mt-1 text-sm text-destructive">{error}</p>
      )}
      {helperText && !error && (
        <p id={helperId} className="mt-1 text-sm text-muted-foreground">{helperText}</p>
      )}
    </div>
  );
}
