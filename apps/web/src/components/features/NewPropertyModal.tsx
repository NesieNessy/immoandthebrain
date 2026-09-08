"use client";

import { Button, Dropdown, Modal } from '@/components/ui';
import { authFetch } from '@/lib/api/authFetch';
import { BUTTON_DETAILS } from '@/constants/ButtonLabels';
import { cn } from '@/lib/utils';
import { ArrowRight, ClipboardCheck, Edit3 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

export type PropertyCreationMode = 'manual' | 'detail-check';

interface DetailCheckApiRow {
  workflow_id: string;
  street_house_number: string | null;
  postal_code: string | null;
  city: string;
  year_of_construction: number;
  living_area_m2: string | number;
  property_category: string | null;
}

/** Data available to prefill the /existing-properties/new form from when
 *  the user picked an existing detail-check — a subset of the
 *  /api/detail-checks row shape. Detail-check data has no purchase-date
 *  concept, so the purchase date is never prefilled either way. */
interface DetailCheckPrefill {
  streetHouseNumber: string | null;
  postalCode: string | null;
  city: string;
  yearOfConstruction: number;
  livingAreaM2: number;
  propertyCategory: string | null;
}

interface DetailCheckOption {
  workflowId: string;
  label: string;
  prefill: DetailCheckPrefill;
}

interface NewPropertyModalProps {
  open: boolean;
  onClose: () => void;
}

function OptionCard({
  icon: Icon,
  title,
  description,
  selected,
  onClick,
}: {
  icon: React.ElementType;
  title: string;
  description: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "w-full flex items-start gap-3 p-4 rounded-lg border text-left transition-colors",
        selected ? "border-primary bg-primary/5" : "border-border hover:bg-muted"
      )}
    >
      <div
        className={cn(
          "shrink-0 w-9 h-9 rounded-lg flex items-center justify-center",
          selected ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
        )}
      >
        <Icon className="w-4 h-4" />
      </div>
      <div className="flex-1 min-w-0">
        <p className={cn("text-sm font-medium", selected ? "text-primary" : "text-foreground")}>{title}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
      </div>
      <div
        className={cn(
          "shrink-0 w-5 h-5 rounded-full border-2 flex items-center justify-center mt-0.5",
          selected ? "border-primary bg-primary" : "border-border"
        )}
      >
        {selected && <div className="w-2 h-2 rounded-full bg-primary-foreground" />}
      </div>
    </button>
  );
}

/**
 * "Neues Objekt anlegen" — first step of the (not yet built) property
 * creation flow. Lets the user choose between a blank form or pre-filling
 * from an existing detail-check, sourced from the same /api/detail-checks
 * route the detail-check overview uses.
 */
export function NewPropertyModal({ open, onClose }: NewPropertyModalProps) {
  const router = useRouter();
  const [mode, setMode] = useState<PropertyCreationMode>('detail-check');
  const [workflowId, setWorkflowId] = useState('');
  const [options, setOptions] = useState<DetailCheckOption[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // Reset selection and (re-)load the detail-check list each time the
  // modal opens, so it reflects any detail checks saved since last time.
  useEffect(() => {
    if (!open) return;
    setMode('detail-check');
    setWorkflowId('');
    setIsLoading(true);
    authFetch('/api/detail-checks', { cache: 'no-store' })
      .then((res) => res.json())
      .then((rows: DetailCheckApiRow[]) => {
        setOptions(rows.map((row) => ({
          workflowId: row.workflow_id,
          label: `${row.street_house_number || 'Adresse noch nicht erfasst'}, ${row.city}`,
          prefill: {
            streetHouseNumber: row.street_house_number,
            postalCode: row.postal_code,
            city: row.city,
            yearOfConstruction: row.year_of_construction,
            livingAreaM2: Number(row.living_area_m2),
            propertyCategory: row.property_category,
          },
        })));
      })
      .catch(() => setOptions([]))
      .finally(() => setIsLoading(false));
  }, [open]);

  const canContinue = mode === 'manual' || workflowId !== '';
  const selectedOption = options.find((opt) => opt.workflowId === workflowId) ?? null;

  const handleContinue = () => {
    const prefill = mode === 'detail-check' ? selectedOption?.prefill : null;
    onClose();
    if (!prefill) {
      router.push('/existing-properties/new');
      return;
    }
    const params = new URLSearchParams();
    if (prefill.streetHouseNumber) params.set('strasse', prefill.streetHouseNumber);
    if (prefill.postalCode) params.set('plz', prefill.postalCode);
    if (prefill.city) params.set('ort', prefill.city);
    params.set('baujahr', String(prefill.yearOfConstruction));
    params.set('wohnflaeche', String(prefill.livingAreaM2));
    if (prefill.propertyCategory) params.set('kategorie', prefill.propertyCategory);
    router.push(`/existing-properties/new?${params.toString()}`);
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Neues Objekt anlegen"
      subtitle="Möchten Sie Daten aus einer vorhandenen Detailbewertung übernehmen?"
      footer={
        <>
          <Button label={BUTTON_DETAILS.Cancel.label} variant="outline" onClick={onClose} />
          <Button
            label="Weiter"
            icon={<ArrowRight className="w-4 h-4" />}
            iconPosition="right"
            variant="primary"
            disabled={!canContinue}
            onClick={handleContinue}
          />
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <OptionCard
          icon={Edit3}
          title="Manuell erfassen"
          description="Alle Felder werden leer geöffnet und können manuell befüllt werden."
          selected={mode === 'manual'}
          onClick={() => setMode('manual')}
        />
        <OptionCard
          icon={ClipboardCheck}
          title="Aus Detailbewertung übernehmen"
          description="Adresse, Kaufdatum und Objektdaten werden aus einer Bewertung vorausgefüllt."
          selected={mode === 'detail-check'}
          onClick={() => setMode('detail-check')}
        />
      </div>

      {mode === 'detail-check' && (
        <Dropdown
          label="Detailbewertung auswählen"
          options={[
            { value: '', label: isLoading ? 'Wird geladen…' : 'Bitte wählen...' },
            ...options.map((opt) => ({ value: opt.workflowId, label: opt.label })),
          ]}
          value={workflowId}
          onChange={(e) => setWorkflowId(e.target.value)}
          disabled={isLoading}
        />
      )}
    </Modal>
  );
}
