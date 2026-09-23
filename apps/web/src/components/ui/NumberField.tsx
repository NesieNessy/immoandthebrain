"use client";

import React from "react";
import { cn } from "@/lib/utils";
import { FieldLabel, useFieldIds } from "./fieldIds";

interface NumberFieldProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label?: string;
  error?: string;
  unit?: string;
  /** Removes the stepper entirely — both the visual up/down spin buttons
   *  and the native ArrowUp/ArrowDown keyboard increment/decrement, which
   *  fires even with the buttons hidden (they're separate browser behaviors
   *  for a number input; hiding the buttons alone left the arrow keys still
   *  silently nudging the value). For fields (year, price, area) where
   *  typing is the expected input and any of that is just accidental. */
  hideStepper?: boolean;
  /** Appends a muted "(optional)" to the label instead of the mandatory
   *  default (no marker). */
  optional?: boolean;
}

export function NumberField({
  label,
  error,
  unit,
  hideStepper,
  optional,
  className,
  readOnly,
  disabled,
  id,
  "aria-describedby": ariaDescribedBy,
  onKeyDown,
  ...props
}: NumberFieldProps) {
  const { controlId, errorId, describedBy, invalid } = useFieldIds({
    id,
    error,
    describedBy: ariaDescribedBy,
  });

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (hideStepper && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
      e.preventDefault();
    }
    onKeyDown?.(e);
  };

  return (
    <div className="w-full">
      {label && (
        <FieldLabel label={label} optional={optional} htmlFor={controlId} className="block mb-2 text-sm text-foreground" />
      )}
      <div className="relative">
        <input
          type="number"
          id={controlId}
          aria-invalid={invalid}
          aria-describedby={describedBy}
          className={cn(
            "w-full rounded-md border border-primary/30 bg-card px-4 py-2 shadow-sm",
            "hover:border-primary/55 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20",
            "transition-[border-color,box-shadow,background-color] duration-150",
            "read-only:border-primary/20 read-only:bg-primary/5 read-only:shadow-none read-only:hover:border-primary/20 read-only:focus:ring-0",
            "disabled:cursor-not-allowed disabled:border-border disabled:bg-muted disabled:text-muted-foreground disabled:shadow-none disabled:hover:border-border",
            unit && "pr-12",
            error && "border-destructive focus:ring-destructive/50",
            hideStepper && "[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none",
            className
          )}
          readOnly={readOnly}
          disabled={disabled}
          onKeyDown={handleKeyDown}
          {...props}
        />
        {unit && (
          <span className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground">
            {unit}
          </span>
        )}
      </div>
      {error && (
        <p id={errorId} role="alert" className="mt-1 text-sm text-destructive">{error}</p>
      )}
    </div>
  );
}
