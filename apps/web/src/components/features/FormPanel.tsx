import { Button, Icons } from '@/components/ui';
import { forwardRef, type ReactNode } from 'react';

/**
 * An inline form as a card: icon + title with a ✕ in the header, the fields,
 * and the actions below a separator line. Used where something is added or
 * edited in place above its list (Sanierung, Handwerkerleistungen) instead of
 * in a modal.
 */
export const FormPanel = forwardRef<HTMLDivElement, {
  id?: string;
  icon: ReactNode;
  title: string;
  onClose: () => void;
  footer: ReactNode;
  children: ReactNode;
}>(function FormPanel({ id, icon, title, onClose, footer, children }, ref) {
  return (
    <div id={id} ref={ref} role="region" aria-label={title} className="scroll-mt-24 rounded-lg border border-border bg-card">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <h4 className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <span className="text-primary [&>svg]:h-4 [&>svg]:w-4" aria-hidden="true">{icon}</span>
          {title}
        </h4>
        <Button variant="outline" size="sm" iconOnly icon={<Icons.X />} aria-label="Formular schließen" onClick={onClose} />
      </div>
      <div className="grid gap-4 p-4 md:grid-cols-2">{children}</div>
      <div className="flex flex-wrap justify-end gap-2 border-t border-border px-4 py-3">{footer}</div>
    </div>
  );
});
