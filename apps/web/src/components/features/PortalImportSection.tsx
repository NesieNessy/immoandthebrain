"use client";

import { Button, Modal, TextField } from '@/components/ui';
import { BUTTON_DETAILS } from '@/constants/ButtonLabels';
import { isValidListingUrl, LISTING_URL_ERROR, listingLinkHref, normalizeListingReference } from '@/lib/listingUrl';
import { cn } from '@/lib/utils';
import type { ReactNode } from 'react';
import { useState } from 'react';

interface Props {
  portalUrl: string;
  onPortalUrlChange: (value: string) => void;
  /** Extra trigger button(s) rendered next to "Aus Portal importieren" — e.g.
   *  the detail-check flow's disabled "Expose scannen" placeholder. */
  extraTrigger?: ReactNode;
  /** Validation error for the Portal-URL field reported by the server. */
  urlError?: string;
}

/**
 * "Aus Portal importieren" trigger + divider + the URL dialog, shared between
 * the quick-check creation form, its result/edit view, and the detail-check
 * Objektdaten step — so all three accept exactly the same input
 * (lib/listingUrl.ts).
 *
 * Importing the listing's data from the portal is not implemented yet. The
 * dialog's confirm button therefore only takes the link over into the form;
 * it becomes enabled as soon as the entered text is a valid URL. It used to
 * be permanently disabled, so nothing the user typed ever looked accepted
 * (SCRUM-102).
 */
export function PortalImportSection({ portalUrl, onPortalUrlChange, extraTrigger, urlError }: Props) {
  const [modalOpen, setModalOpen] = useState(false);
  // The dialog edits a draft, not the form value: an invalid or abandoned
  // entry must never land in the form. Only the confirm button commits it.
  const [draft, setDraft] = useState('');

  const draftIsValid = isValidListingUrl(draft);
  const draftError = draft.trim() && !draftIsValid ? LISTING_URL_ERROR : undefined;

  const savedLink = listingLinkHref(portalUrl);
  // Older quick checks may still hold plain text from before URLs were
  // validated; show it so it can be corrected, instead of hiding it.
  const savedError = urlError ?? (portalUrl.trim() && !savedLink ? 'Kein gültiger Link – bitte korrigieren oder entfernen.' : undefined);

  const openModal = () => {
    setDraft(portalUrl);
    setModalOpen(true);
  };

  const confirm = () => {
    if (!draftIsValid) return;
    onPortalUrlChange(normalizeListingReference(draft));
    setModalOpen(false);
  };

  return (
    <>
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={BUTTON_DETAILS.ImportFromPortal.label}
        subtitle="Link zum Inserat hinterlegen"
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
              disabled={!draftIsValid}
              onClick={confirm}
            />
          </>
        }
      >
        <TextField
          label="Portal-URL"
          placeholder="https://immobilienscout24.de/expose/..."
          helperText="Unterstützte Portale: ImmobilienScout24, Immowelt, Immonet, Kleinanzeigen. Derzeit wird nur der Link gespeichert – die Objektdaten werden noch nicht automatisch übernommen."
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              confirm();
            }
          }}
          error={draftError}
        />
      </Modal>

      <div className={cn("mb-3", extraTrigger ? "grid grid-cols-2 gap-2" : undefined)}>
        <Button
          label={BUTTON_DETAILS.ImportFromPortal.label}
          icon={<BUTTON_DETAILS.ImportFromPortal.icon />}
          variant="outline"
          onClick={openModal}
          className="w-full"
        />
        {extraTrigger}
      </div>

      {portalUrl.trim() && (
        <div className="-mt-1 mb-3 text-sm">
          <div className="flex items-center gap-2">
            <span className="shrink-0 text-muted-foreground">Inserat:</span>
            {savedLink ? (
              <a href={savedLink} target="_blank" rel="noopener noreferrer" className="truncate text-primary underline-offset-2 hover:underline">
                {savedLink}
              </a>
            ) : (
              <span className="truncate">{portalUrl}</span>
            )}
            <button
              type="button"
              onClick={() => onPortalUrlChange('')}
              className="ml-auto shrink-0 text-muted-foreground hover:text-foreground"
            >
              Entfernen
            </button>
          </div>
          {savedError && <p className="mt-1 text-destructive">{savedError}</p>}
        </div>
      )}

      <div className="flex items-center gap-3 mb-3">
        <div className="flex-1 h-px bg-border" />
        <span className="text-xs text-muted-foreground shrink-0">oder manuell ausfüllen</span>
        <div className="flex-1 h-px bg-border" />
      </div>
    </>
  );
}
