// Objektdaten form validation — kept as a plain, JSX-free module (like
// lib/quickCheck/{kpf,validation,display}.ts) so it's importable from
// .test.ts files under the project's node-environment vitest config.

export interface PropertyDataFormFields {
  objektkategorie: string;
  strasseHausnummer: string;
  plz: string;
  ort: string;
  baujahr: string;
  wohnflaeche: string;
  stellplaetze: string;
  kaufpreis: string;
}

/** Mirrors property table's NOT NULL/CHECK constraints for every field this
 *  form can write: street/city/postalCode non-blank, year 1800..currentYear,
 *  square_meters > 0. stellplaetze/kaufpreis are this form's own required
 *  inputs (parking count and purchase price), not separate table columns. */
export function isPropertyDataFormValid(fields: PropertyDataFormFields, currentYear: number): boolean {
  return (
    fields.objektkategorie !== '' &&
    fields.strasseHausnummer.trim() !== '' &&
    /^\d{5}$/.test(fields.plz) &&
    fields.ort.trim() !== '' &&
    /^\d{4}$/.test(fields.baujahr) &&
    Number(fields.baujahr) >= 1800 &&
    Number(fields.baujahr) <= currentYear &&
    Number(fields.wohnflaeche) > 0 &&
    fields.stellplaetze !== '' &&
    Number(fields.stellplaetze) >= 0 &&
    fields.kaufpreis !== '' &&
    Number(fields.kaufpreis) > 0
  );
}

/** Anzahl Zimmer is optional, but property.number_of_rooms has
 *  CHECK (number_of_rooms > 0) whenever it's set — 0 (or blank) both mean
 *  "not specified", never a literal 0, which the DB would reject. */
export function normalizeNumberOfRooms(value: string): number | null {
  const parsed = Number(value);
  return parsed > 0 ? parsed : null;
}
