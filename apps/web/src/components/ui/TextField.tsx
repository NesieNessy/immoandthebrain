"use client";

import React from "react";
import { cn } from "@/lib/utils";
import { FieldLabel, useFieldIds } from "./fieldIds";

interface TextFieldProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helperText?: string;
  suffix?: string;
  /** Appends a muted "(optional)" to the label instead of the mandatory
   *  default (no marker). */
  optional?: boolean;
}

export function TextField({
  label,
  error,
  helperText,
  suffix,
  optional,
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
            suffix && "pr-12",
            className
          )}
          readOnly={readOnly}
          disabled={disabled}
          {...props}
        />
        {suffix && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none">
            {suffix}
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
