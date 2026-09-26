"use client";

import { Dropdown, TextField } from '@/components/ui';
import { CUSTOM_MEASURE, RENOVATION_CATEGORIES, RENOVATION_MEASURES, type RenovationCategory } from '@/lib/renovation/catalog';

export { CUSTOM_MEASURE };

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
  /** Shown but not changeable (e.g. a commissioned measure). */
  disabled?: boolean;
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
  disabled = false,
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
        disabled={disabled}
      />
      <Dropdown
        label="Maßnahme"
        value={measure}
        onChange={(event) => onMeasureChange(event.target.value)}
        disabled={disabled || !category}
        options={measureOptions}
      />
      {allowCustom && measure === CUSTOM_MEASURE && (
        <TextField
          label="Bezeichnung"
          placeholder="z.B. Treppenhaus streichen"
          value={customTitle}
          disabled={disabled}
          onChange={(event) => onCustomTitleChange?.(event.target.value)}
        />
      )}
    </>
  );
}
