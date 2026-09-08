"use client";

import React from "react";
import { cn } from "@/lib/utils";
import { FieldLabel, useFieldIds } from "./fieldIds";

interface DropdownProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  helperText?: string;
  options: { value: string; label: string; disabled?: boolean }[];
  /** Appends a muted "(optional)" to the label instead of the mandatory
   *  default (no marker). */
  optional?: boolean;
}

export function Dropdown({
  label,
  error,
  helperText,
  options,
  optional,
  className,
  id,
  "aria-describedby": ariaDescribedBy,
  ...props
}: DropdownProps) {
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
      <select
        id={controlId}
        aria-invalid={invalid}
        aria-describedby={describedBy}
        className={cn(
          "w-full cursor-pointer appearance-none rounded-md border border-primary/30 bg-card px-4 py-2 shadow-sm",
          "hover:border-primary/55 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20",
          "transition-[border-color,box-shadow,background-color] duration-150",
          "disabled:cursor-not-allowed disabled:border-border disabled:bg-muted disabled:text-muted-foreground disabled:shadow-none disabled:hover:border-border",
          "bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTIiIGhlaWdodD0iOCIgdmlld0JveD0iMCAwIDEyIDgiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PHBhdGggZD0iTTEgMUw2IDZMMTEgMSIgc3Ryb2tlPSIjNkI3MjgwIiBzdHJva2Utd2lkdGg9IjIiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIgc3Ryb2tlLWxpbmVqb2luPSJyb3VuZCIvPjwvc3ZnPg==')] bg-no-repeat bg-[position:center_right_1rem]",
          error && "border-destructive focus:ring-destructive/50",
          className
        )}
        {...props}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value} disabled={option.disabled}>
            {option.label}
          </option>
        ))}
      </select>
      {error && (
        <p id={errorId} role="alert" className="mt-1 text-sm text-destructive">{error}</p>
      )}
      {helperText && !error && (
        <p id={helperId} className="mt-1 text-sm text-muted-foreground">{helperText}</p>
      )}
    </div>
  );
}
