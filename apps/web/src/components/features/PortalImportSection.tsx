"use client";

import { Button, Modal, TextField } from '@/components/ui';
import { BUTTON_DETAILS } from '@/constants/ButtonLabels';
import { cn } from '@/lib/utils';
import type { ReactNode } from 'react';
import { useState } from 'react';

interface Props {
  portalUrl: string;
  onPortalUrlChange: (value: string) => void;
  /** Extra trigger button(s) rendered next to "Aus Portal importieren" — e.g.
   *  the detail-check flow's disabled "Expose scannen" placeholder. */
  extraTrigger?: ReactNode;
  /** Validation error for the Portal-URL field, e.g. "not a valid URL". */
  urlError?: string;
}

/**
 * "Aus Portal importieren" trigger + divider + the (currently stubbed) URL
 * import modal, shared between the quick-check creation form, its result/edit
 * view, and the detail-check Objektdaten step.
 */
export function PortalImportSection({ portalUrl, onPortalUrlChange, extraTrigger, urlError }: Props) {
  const [modalOpen, setModalOpen] = useState(false);

  return (
    <>
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={BUTTON_DETAILS.ImportFromPortal.label}
        subtitle="Immobiliendaten aus einem Portal laden"
        icon={<BUTTON_DETAILS.ImportFromPortal.icon />}
        footer={
          <>
            <Button
              label={BUTTON_DETAILS.Cancel.label}
              icon={<BUTTON_DETAILS.Cancel.icon />}
              variant="outline"
              onClick={() => setModalOpen(false)}
            />
            <Button
              label={BUTTON_DETAILS.ImportFromPortal.label}
              icon={<BUTTON_DETAILS.ImportFromPortal.icon />}
              variant="primary"
              disabled
              title="URL-Import ist noch nicht verfügbar"
            />
          </>
        }
      >
        <TextField
          label="Portal-URL"
          placeholder="https://immobilienscout24.de/expose/..."
          helperText="Unterstützte Portale: ImmobilienScout24, Immowelt, Immonet, Kleinanzeigen"
          value={portalUrl}
          onChange={(e) => onPortalUrlChange(e.target.value)}
          error={urlError}
        />
      </Modal>

      <div className={cn("mb-3", extraTrigger ? "grid grid-cols-2 gap-2" : undefined)}>
        <Button
          label={BUTTON_DETAILS.ImportFromPortal.label}
          icon={<BUTTON_DETAILS.ImportFromPortal.icon />}
          variant="outline"
          onClick={() => setModalOpen(true)}
          className="w-full"
        />
        {extraTrigger}
      </div>

      <div className="flex items-center gap-3 mb-3">
        <div className="flex-1 h-px bg-border" />
        <span className="text-xs text-muted-foreground shrink-0">oder manuell ausfüllen</span>
        <div className="flex-1 h-px bg-border" />
      </div>
    </>
  );
}
