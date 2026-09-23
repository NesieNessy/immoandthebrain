"use client";

import React from "react";
import { cn } from "@/lib/utils";
import { Icons } from "../common";
import { FieldLabel, useFieldIds } from "./fieldIds";
import { Calendar } from "../ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";
import { format } from "date-fns";

interface CalendarFieldProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type' | 'value' | 'onChange'> {
  label?: string;
  error?: string;
  value?: Date;
  onChange?: (date: Date | undefined) => void;
  /** Appends a muted "(optional)" to the label instead of the mandatory
   *  default (no marker). */
  optional?: boolean;
}

export function CalendarField({
  label,
  error,
  value,
  onChange,
  optional,
  className,
  id,
  "aria-describedby": ariaDescribedBy,
  ...props
}: CalendarFieldProps) {
  const { controlId, errorId, describedBy, invalid } = useFieldIds({
    id,
    error,
    describedBy: ariaDescribedBy,
  });
  const [open, setOpen] = React.useState(false);
  const [inputValue, setInputValue] = React.useState(value ? format(value, "dd.MM.yyyy") : "");

  React.useEffect(() => {
    setInputValue(value ? format(value, "dd.MM.yyyy") : "");
  }, [value]);

  const handleSelect = (date: Date | undefined) => {
    onChange?.(date);
    setOpen(false);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    setInputValue(newValue);

    // Clearing the field has to actually clear the value — otherwise blur's
    // "reset to the current value" snaps the old date right back in, and
    // the field can never be emptied by deleting its text.
    if (newValue === "") {
      onChange?.(undefined);
      return;
    }

    // Try to parse various date formats — while still typing, only the
    // unambiguous ones (see parseFlexibleDate's `finalize` parameter).
    const parsedDate = parseFlexibleDate(newValue);
    if (parsedDate) {
      onChange?.(parsedDate);
    }
  };

  const handleBlur = () => {
    // Typing has stopped, so the more permissive formats (short year,
    // free-form) can be tried too — commit them if they parse.
    const parsedDate = parseFlexibleDate(inputValue, { finalize: true });
    if (parsedDate) {
      onChange?.(parsedDate);
      return;
    }
    // If input is invalid, reset to the current value — including clearing
    // unparseable text when there never was a valid value to fall back to
    // (previously left stuck in the field forever).
    setInputValue(value ? format(value, "dd.MM.yyyy") : "");
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      const parsedDate = parseFlexibleDate(inputValue, { finalize: true });
      if (parsedDate) {
        onChange?.(parsedDate);
        setOpen(false);
      }
    }
  };

  return (
    <div className="w-full">
      {label && (
        <FieldLabel label={label} optional={optional} htmlFor={controlId} className="block mb-2 text-sm text-foreground" />
      )}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild disabled={props.readOnly || props.disabled}>
          <div className="relative">
            <input
              type="text"
              id={controlId}
              aria-invalid={invalid}
              aria-describedby={describedBy}
              value={inputValue}
              onChange={handleInputChange}
              onBlur={handleBlur}
              onKeyDown={handleKeyDown}
              placeholder={props.placeholder || "dd.mm.yyyy"}
              className={cn(
                "w-full rounded-md border border-primary/30 bg-card px-4 py-2 shadow-sm cursor-text",
                !props.readOnly && !props.disabled && (value ? "pr-16" : "pr-10"),
                "hover:border-primary/55 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20",
                "transition-[border-color,box-shadow,background-color] duration-150",
                "read-only:cursor-default read-only:border-primary/20 read-only:bg-primary/5 read-only:shadow-none read-only:hover:border-primary/20 read-only:focus:ring-0",
                "disabled:cursor-not-allowed disabled:border-border disabled:bg-muted disabled:text-muted-foreground disabled:shadow-none disabled:hover:border-border",
                error && "border-destructive focus:ring-destructive/50",
                className
              )}
              {...props}
            />
            {!props.readOnly && !props.disabled && (
              <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-0.5">
                {value && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setInputValue("");
                      onChange?.(undefined);
                    }}
                    aria-label={label ? `${label}: Datum löschen` : "Datum löschen"}
                    className="p-1 rounded text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                  >
                    <Icons.X size={16} aria-hidden="true" />
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setOpen(!open)}
                  aria-label={label ? `${label}: Kalender öffnen` : "Kalender öffnen"}
                  aria-expanded={open}
                  className="p-1 rounded text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                >
                  <Icons.Calendar size={18} aria-hidden="true" />
                </button>
              </div>
            )}
          </div>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="single"
            selected={value}
            defaultMonth={value}
            onSelect={handleSelect}
            initialFocus
          />
        </PopoverContent>
      </Popover>
      {error && (
        <p id={errorId} role="alert" className="mt-1 text-sm text-destructive">{error}</p>
      )}
    </div>
  );
}

// Helper function to parse flexible date formats. `finalize` distinguishes
// "the user is done typing" (blur/Enter) from "still typing" (every
// keystroke): the DD.MM.YY short-year form and the free-form fallback are
// only tried when finalize is true, because mid-keystroke they're
// indistinguishable from a truncated prefix of a longer date the user is
// still in the middle of typing — e.g. "01.02.20" is exactly what the input
// looks like 8 characters into typing "01.02.2026". Matching it live used to
// commit the wrong year immediately, which then snapped the input's
// displayed text back to that wrong value (via the `value` prop round-trip)
// and corrupted every keystroke typed after it.
function parseFlexibleDate(input: string, options: { finalize?: boolean } = {}): Date | null {
  if (!input) return null;
  const { finalize = false } = options;

  // Try various date formats
  const formats = [
    // DD.MM.YY or D.M.YY — only once typing has stopped, see above.
    ...(finalize ? [{ regex: /^(\d{1,2})\.(\d{1,2})\.(\d{2})$/, order: 'dmy2' }] : []),
    // DD.MM.YYYY or D.M.YYYY
    { regex: /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/, order: 'dmy4' },
    // MM/DD/YYYY or M/D/YYYY
    { regex: /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/, order: 'mdy4' },
    // MM-DD-YYYY or M-D-YYYY
    { regex: /^(\d{1,2})-(\d{1,2})-(\d{4})$/, order: 'mdy4' },
    // DD/MM/YYYY or D/M/YYYY
    { regex: /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/, order: 'dmy4' },
    // DD-MM-YYYY or D-M-YYYY
    { regex: /^(\d{1,2})-(\d{1,2})-(\d{4})$/, order: 'dmy4' },
    // YYYY/MM/DD or YYYY/M/D
    { regex: /^(\d{4})\/(\d{1,2})\/(\d{1,2})$/, order: 'ymd' },
    // YYYY-MM-DD or YYYY-M-D
    { regex: /^(\d{4})-(\d{1,2})-(\d{1,2})$/, order: 'ymd' },
  ];

  for (const format of formats) {
    const match = input.match(format.regex);
    if (match) {
      let year: number, month: number, day: number;
      
      if (format.order === 'dmy2') {
        // DD.MM.YY format - assume 20xx for years
        day = parseInt(match[1], 10);
        month = parseInt(match[2], 10) - 1; // Month is 0-indexed
        const yearShort = parseInt(match[3], 10);
        year = yearShort < 100 ? 2000 + yearShort : yearShort;
      } else if (format.order === 'dmy4') {
        // DD.MM.YYYY or DD/MM/YYYY or DD-MM-YYYY format
        day = parseInt(match[1], 10);
        month = parseInt(match[2], 10) - 1; // Month is 0-indexed
        year = parseInt(match[3], 10);
      } else if (format.order === 'ymd') {
        // YYYY-MM-DD format
        year = parseInt(match[1], 10);
        month = parseInt(match[2], 10) - 1; // Month is 0-indexed
        day = parseInt(match[3], 10);
      } else {
        // MM/DD/YYYY format
        month = parseInt(match[1], 10) - 1; // Month is 0-indexed
        day = parseInt(match[2], 10);
        year = parseInt(match[3], 10);
      }

      const date = new Date(year, month, day);
      
      // Validate the date
      if (
        date.getFullYear() === year &&
        date.getMonth() === month &&
        date.getDate() === day
      ) {
        return date;
      }
    }
  }

  // Try natural language parsing (e.g., "January 15, 2024") — only once
  // typing has stopped (see the function comment above): plenty of partial,
  // still-being-typed strings also happen to parse as *some* date under the
  // native Date constructor's lenient rules.
  if (finalize) {
    const naturalDate = new Date(input);
    if (!isNaN(naturalDate.getTime())) {
      return naturalDate;
    }
  }

  return null;
}
