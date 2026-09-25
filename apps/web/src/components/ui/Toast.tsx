"use client";

import { Icons } from "@/components/common";
import { cn } from "@/lib/utils";
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";

type ToastVariant = "success" | "warning" | "error";

interface ToastItem {
  id: number;
  message: string;
  variant: ToastVariant;
  leaving: boolean;
}

interface ToastContextValue {
  showToast: (message: string, variant?: ToastVariant) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

// Errors and warnings usually carry something to act on, so they stay up
// longer than a plain "gespeichert" confirmation.
const AUTO_DISMISS_MS: Record<ToastVariant, number> = {
  success: 3500,
  warning: 5000,
  error: 6500,
};
// Matches .toast-exit in theme.css.
const EXIT_ANIMATION_MS = 180;
// How far a touch has to travel (up or sideways) to count as a dismiss swipe.
const SWIPE_DISMISS_PX = 48;

const VARIANT_STYLES: Record<ToastVariant, { container: string; icon: React.ElementType; label: string }> = {
  success: { container: "bg-success text-success-foreground shadow-success/30", icon: Icons.CheckCircle2, label: "Erfolg" },
  // Navy, not white, on amber: white only reaches ~2.9:1 contrast there.
  warning: { container: "bg-warning text-brand-navy shadow-warning/30", icon: Icons.AlertTriangle, label: "Hinweis" },
  error: { container: "bg-destructive text-destructive-foreground shadow-destructive/30", icon: Icons.XCircle, label: "Fehler" },
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(0);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const remove = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  // Plays the exit animation first, then unmounts.
  const dismiss = useCallback((id: number) => {
    const timer = timers.current.get(id);
    if (timer) clearTimeout(timer);
    timers.current.delete(id);
    setToasts((prev) => prev.map((t) => (t.id === id ? { ...t, leaving: true } : t)));
    setTimeout(() => remove(id), EXIT_ANIMATION_MS);
  }, [remove]);

  const showToast = useCallback((message: string, variant: ToastVariant = "success") => {
    const id = nextId.current++;
    setToasts((prev) => [...prev, { id, message, variant, leaving: false }]);
    timers.current.set(id, setTimeout(() => dismiss(id), AUTO_DISMISS_MS[variant]));
  }, [dismiss]);

  useEffect(() => {
    const pending = timers.current;
    return () => pending.forEach(clearTimeout);
  }, []);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      {/* Sits directly under the fixed navigation bar (h-16) and uses the
          same container as the nav and page content, so on desktop the
          toasts line up under the right-hand nav actions (logout) instead
          of hugging the viewport edge. On mobile they span the content
          width as a banner. */}
      <div className="pointer-events-none fixed inset-x-0 top-16 z-[100]">
        <div className="container mx-auto flex flex-col items-stretch gap-2 px-3 pt-3 sm:items-end sm:px-4">
          {toasts.map((toast) => (
            <ToastCard key={toast.id} toast={toast} onDismiss={() => dismiss(toast.id)} />
          ))}
        </div>
      </div>
    </ToastContext.Provider>
  );
}

function ToastCard({ toast, onDismiss }: { toast: ToastItem; onDismiss: () => void }) {
  const { container, icon: Icon, label } = VARIANT_STYLES[toast.variant];
  const touchStart = useRef<{ x: number; y: number } | null>(null);

  // Mobile: swipe the toast up or sideways to dismiss it.
  const handleTouchStart = (e: React.TouchEvent) => {
    const touch = e.touches[0];
    touchStart.current = { x: touch.clientX, y: touch.clientY };
  };
  const handleTouchEnd = (e: React.TouchEvent) => {
    const start = touchStart.current;
    touchStart.current = null;
    if (!start) return;
    const touch = e.changedTouches[0];
    const dx = touch.clientX - start.x;
    const dy = touch.clientY - start.y;
    if (Math.abs(dx) > SWIPE_DISMISS_PX || dy < -SWIPE_DISMISS_PX) onDismiss();
  };

  return (
    <div
      role={toast.variant === "error" ? "alert" : "status"}
      aria-live={toast.variant === "error" ? "assertive" : "polite"}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      className={cn(
        "pointer-events-auto relative w-full overflow-hidden rounded-xl shadow-lg sm:w-96",
        container,
        toast.leaving ? "toast-exit" : "toast-enter",
      )}
    >
      <div className="flex items-center gap-3 py-3 pl-3 pr-2 sm:py-3 sm:pl-4">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/20">
          <Icon className="h-[18px] w-[18px]" aria-hidden="true" />
        </span>
        <p className="flex-1 text-sm font-medium leading-snug">
          <span className="sr-only">{label}: </span>
          {toast.message}
        </p>
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Schließen"
          className="shrink-0 cursor-pointer rounded-lg p-2 opacity-80 transition hover:bg-white/15 hover:opacity-100 focus-visible:outline-2 focus-visible:outline-current"
        >
          <Icons.X className="h-4 w-4" />
        </button>
      </div>
      {/* Remaining display time */}
      <div
        className="toast-progress absolute inset-x-0 bottom-0 h-1 bg-white/35"
        style={{ "--toast-duration": `${AUTO_DISMISS_MS[toast.variant]}ms` } as React.CSSProperties}
        aria-hidden="true"
      />
    </div>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within a ToastProvider");
  return ctx;
}
