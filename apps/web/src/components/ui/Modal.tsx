"use client"

import { cn } from "@/lib/utils";
import { Icons } from "@/components/common";
import React, { useEffect, useRef } from "react";
import { createPortal } from "react-dom";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  icon?: React.ReactNode;
  children?: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
  /** Max width class — defaults to "max-w-lg" */
  maxWidth?: string;
}

export function Modal({
  open,
  onClose,
  title,
  subtitle,
  icon,
  children,
  footer,
  className,
  maxWidth = "max-w-lg",
}: ModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open, onClose]);

  // Prevent body scroll while open
  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  if (!open || typeof document === 'undefined') return null;

  // Rendered into document.body, not in place. A `fixed inset-0` overlay is
  // only viewport-fixed while no ancestor sets transform/will-change: the
  // detail-check wizard's step animation (PropertyValuationLayout) does, which
  // made every dialog inside a step anchor to that scrolling wrapper instead
  // of the browser window — off-centre, and not covering the navigation. A
  // portal takes the overlay out of that ancestor chain for every caller.
  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      aria-modal="true"
      role="dialog"
      aria-labelledby={title ? "modal-title" : undefined}
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Panel */}
      <div
        ref={dialogRef}
        className={cn(
          "relative z-10 w-full mx-4 bg-card border border-border rounded-xl shadow-xl",
          "flex flex-col",
          maxWidth,
          className
        )}
      >
        {/* Header */}
        {(title || icon) && (
          <div className="flex items-start gap-4 px-6 pt-6 pb-4 border-b border-border">
            {icon && (
              <div className="shrink-0 w-10 h-10 flex items-center justify-center rounded-lg bg-muted text-primary">
                {icon}
              </div>
            )}
            <div className="flex-1 min-w-0">
              {title && (
                <h2
                  id="modal-title"
                  className="text-lg font-semibold text-foreground leading-tight"
                >
                  {title}
                </h2>
              )}
              {subtitle && (
                <p className="mt-0.5 text-sm text-muted-foreground">{subtitle}</p>
              )}
            </div>
            <button
              onClick={onClose}
              aria-label="Schließen"
              className="shrink-0 p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            >
              <Icons.X className="w-5 h-5" />
            </button>
          </div>
        )}

        {/* Body */}
        {children && (
          <div className="px-6 py-5 flex flex-col gap-4">{children}</div>
        )}

        {/* Footer */}
        {footer && (
          <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-border">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
