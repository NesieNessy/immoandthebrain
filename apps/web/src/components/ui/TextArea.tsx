"use client";

import React from "react";
import { cn } from "@/lib/utils";
import { FieldLabel, useFieldIds } from "./fieldIds";

interface TextAreaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
  helperText?: string;
  /** Appends a muted "(optional)" to the label instead of the mandatory
   *  default (no marker). */
  optional?: boolean;
}

export function TextArea({
  label,
  error,
  helperText,
  optional,
  className,
  id,
  "aria-describedby": ariaDescribedBy,
  ...props
}: TextAreaProps) {
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
      <textarea
        id={controlId}
        aria-invalid={invalid}
        aria-describedby={describedBy}
        className={cn(
          "min-h-[100px] w-full resize-y rounded-md border border-primary/30 bg-card px-4 py-2 shadow-sm",
          "hover:border-primary/55 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20",
          "transition-[border-color,box-shadow,background-color] duration-150",
          "read-only:border-primary/20 read-only:bg-primary/5 read-only:shadow-none read-only:hover:border-primary/20 read-only:focus:ring-0",
          "disabled:cursor-not-allowed disabled:border-border disabled:bg-muted disabled:text-muted-foreground disabled:shadow-none disabled:hover:border-border",
          error && "border-destructive focus:ring-destructive/50",
          className
        )}
        {...props}
      />
      {error && (
        <p id={errorId} role="alert" className="mt-1 text-sm text-destructive">{error}</p>
      )}
      {helperText && !error && (
        <p id={helperId} className="mt-1 text-sm text-muted-foreground">{helperText}</p>
      )}
    </div>
  );
}
