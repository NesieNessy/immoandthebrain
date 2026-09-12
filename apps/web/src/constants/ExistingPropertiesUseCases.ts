export enum ExistingPropertiesUseCases {
  PropertyData = 'Objektdaten',
  RND = 'Restnutzungsdauer',
  SplitPurchasePrice = 'Kaufpreisaufteilung',
  TenantData = 'Mieterdaten',
  TenantHistory = 'Mieterhistorie',
  TenancyTrends = 'Mietentwicklung',
  ServiceChargeSettlement = 'Nebenkostenabrechnung',
  Contractors = 'Handwerkerleistungen',
  TaxDocuments = 'Steuerunterlagen',
  KeyMetrics = 'Kennzahlen',
  Sale = 'Verkauf',
  TenantMoveOut = 'Mieterauszug',
}

// The matching icon per use case lives in `lib/useCaseMenu.tsx` as a map of
// real component references. It used to sit here as icon *names*, which forced
// a `lucide-react` namespace import (and the whole icon set) into the bundle.
