"use client";

import { Dropdown, TextField } from '@/components/ui';
import { RENOVATION_CATEGORIES, RENOVATION_MEASURES, type RenovationCategory } from '@/lib/renovation/catalog';

/** Maßnahme option that switches to a free-text title (see `allowCustom`). */
export const CUSTOM_MEASURE = '__custom__';

interface RenovationMeasurePickerProps {
  category: RenovationCategory | '';
  measure: string;
  onCategoryChange: (category: RenovationCategory | '') => void;
  onMeasureChange: (measure: string) => void;
  /** Offers "Andere Maßnahme…" plus a free-text Bezeichnung field, for work
   *  the catalog doesn't list. */
  allowCustom?: boolean;
  customTitle?: string;
  onCustomTitleChange?: (title: string) => void;
}

/**
 * Kategorie → Maßnahme selection from the shared renovation catalog. Renders
 * its fields as siblings (no wrapper), so the caller's grid/stack decides the
 * layout.
 */
export function RenovationMeasurePicker({
  category,
  measure,
  onCategoryChange,
  onMeasureChange,
  allowCustom = false,
  customTitle = '',
  onCustomTitleChange,
}: RenovationMeasurePickerProps) {
  const measureOptions = [
    { value: '', label: category ? 'Bitte wählen…' : 'Erst Kategorie wählen…' },
    ...(category ? RENOVATION_MEASURES[category] : []).map((item) => ({ value: item, label: item })),
    ...(allowCustom && category ? [{ value: CUSTOM_MEASURE, label: 'Andere Maßnahme…' }] : []),
  ];

  return (
    <>
      <Dropdown
        label="Kategorie"
        value={category}
        onChange={(event) => {
          onCategoryChange(event.target.value as RenovationCategory | '');
          onMeasureChange('');
        }}
        options={[{ value: '', label: 'Bitte wählen…' }, ...RENOVATION_CATEGORIES]}
      />
      <Dropdown
        label="Maßnahme"
        value={measure}
        onChange={(event) => onMeasureChange(event.target.value)}
        disabled={!category}
        options={measureOptions}
      />
      {allowCustom && measure === CUSTOM_MEASURE && (
        <TextField
          label="Bezeichnung"
          placeholder="z.B. Treppenhaus streichen"
          value={customTitle}
          onChange={(event) => onCustomTitleChange?.(event.target.value)}
        />
      )}
    </>
  );
}
