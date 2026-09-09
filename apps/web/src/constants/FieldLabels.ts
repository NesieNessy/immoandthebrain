// ==============================================================================
// ImmoAndTheBrain – Frontend Field Labels (i18n: English & German)
// All IDs are excluded (handled separately).
//
// Usage:
//   getLabel("Property", "SquareMeters", "en")  → "Square Meters"
//   getLabel("Property", "SquareMeters", "de")  → "Quadratmeter"
//   getTableLabels("Tenancy", "de")             → { IsRented: "Vermietet", ... }
// ==============================================================================

export type Language = "en" | "de";

type TranslatedLabel = { en: string; de: string };
type TableLabels = Record<string, TranslatedLabel>;

export const FieldLabels: Record<string, TableLabels> = {

  // ----------------------------------------------------------------------------
  // 1. PersonalData
  // ----------------------------------------------------------------------------
  PersonalData: {
    LastName: { en: "Last Name", de: "Nachname" },
    FirstName: { en: "First Name", de: "Vorname" },
    Street: { en: "Street", de: "Straße" },
    HouseNumber: { en: "House Number", de: "Hausnummer" },
    City: { en: "City", de: "Stadt" },
    PostalCode: { en: "Postal Code", de: "Postleitzahl" },
    PhoneNumber: { en: "Phone Number", de: "Telefonnummer" },
    EmailAddress: { en: "Email Address", de: "E-Mail-Adresse" },
    taxIdentificationNumber: { en: "Tax Identification Number", de: "Steueridentifikationsnummer" },
    ProfilePicture: { en: "Profile Picture", de: "Profilbild" },
  },

  // ----------------------------------------------------------------------------
  // 2. Subscription
  // ----------------------------------------------------------------------------
  Subscription: {
    SubscriptionModel: { en: "Subscription Model", de: "Abomodell" },
  },

  // ----------------------------------------------------------------------------
  // 3. Password
  // ----------------------------------------------------------------------------
  Password: {
    PasswordHash: { en: "Password Hash", de: "Passwort-Hash" },
  },

  // ----------------------------------------------------------------------------
  // 4. Property (formerly PropertyParameter)
  // ----------------------------------------------------------------------------
  Property: {
    PropertyAbbreviation: { en: "Property Abbreviation", de: "Objektkürzel" },
    Street: { en: "Street", de: "Straße" },
    HouseNumber: { en: "House Number", de: "Hausnummer" },
    City: { en: "City", de: "Stadt" },
    PostalCode: { en: "Postal Code", de: "Postleitzahl" },
    FederalState: { en: "Federal State", de: "Bundesland" },
    SquareMeters: { en: "Square Meters", de: "Quadratmeter" },
    NumberOfRooms: { en: "Number of Rooms", de: "Anzahl Zimmer" },
    YearOfConstruction: { en: "Year of Construction", de: "Baujahr" },
    EnergyEfficient: { en: "Energy Efficient", de: "Energieeffizient" },
  },

  // ----------------------------------------------------------------------------
  // 5. PropertyAcquisition
  // ----------------------------------------------------------------------------
  PropertyAcquisition: {
    HouseCompletionYear: { en: "House Completion Year", de: "Fertigstellungsjahr" },
    PurchaseDate: { en: "Purchase Date", de: "Kaufdatum" },
    TransferDate: { en: "Transfer Date", de: "Übertragsdatum" },
  },

  // ----------------------------------------------------------------------------
  // 6. ParkingSpaces
  // ----------------------------------------------------------------------------
  ParkingSpaces: {
    ParkingSpaceType: { en: "Parking Space Type", de: "Stellplatzart" },
    NumberOfParkingSpaces: { en: "Number of Parking Spaces", de: "Anzahl Stellplätze" },
  },

  // ----------------------------------------------------------------------------
  // 7. AcquisitionCosts (Kaufkosten)
  // ----------------------------------------------------------------------------
  AcquisitionCosts: {
    PurchasePrice: { en: "Purchase Price", de: "Kaufpreis" },
    PricePerSqm: { en: "Price per sqm", de: "Quadratmeterpreis" },
    Broker: { en: "Broker", de: "Makler" },
    BrokerValue: { en: "Broker Value", de: "Maklerwert" },
    Notary: { en: "Notary", de: "Notar" },
    NotaryValue: { en: "Notary Value", de: "Notarwert" },
    LandRegistry: { en: "Land Registry", de: "Grundbuchamt" },
    LandRegistryValue: { en: "Land Registry Value", de: "Grundbuchamtwert" },
    RealEstateTax: { en: "Real Estate Tax", de: "Grunderwerbssteuer" },
    RealEstateTaxValue: { en: "Real Estate Tax Value", de: "Grunderwerbssteuerwert" },
    AdjustmentVariable: { en: "Adjustment Variable", de: "Anpassungsvariable" },
    AdjustmentVariableValue: { en: "Adjustment Variable Value", de: "Anpassungsvariable Wert" },
    TotalAncillaryCostsValue: { en: "Total Ancillary Costs Value", de: "Summe Kaufpreis-Nebenkostenwert" },
    TotalAncillaryCosts: { en: "Total Ancillary Costs", de: "Summe Kaufpreis-Nebenkosten" },
    ParkingSpacePurchasePrice: { en: "Parking Space Purchase Price", de: "Kaufpreis Stellplatz" },
  },

  // ----------------------------------------------------------------------------
  // 8. MaintenanceCosts (Bewirtschaftungskosten)
  // ----------------------------------------------------------------------------
  MaintenanceCosts: {
    CostBreakdown: { en: "Cost Breakdown", de: "BWK Aufschlüsselung" },
    AllocableCosts: { en: "Allocable Costs", de: "BWK Umlagefähig" },
    NonAllocableCosts: { en: "Non-Allocable Costs", de: "BWK Nicht-Umlagefähig" },
    TotalCosts: { en: "Total Costs", de: "BWK Gesamt" },
    HouseMoney: { en: "House Money", de: "Hausgeld" },
    AllocableCosts_Projection: { en: "Allocable Costs (Projection)", de: "BWK Umlagefähig (Annahme Weiterentwicklung)" },
    NonAllocableCosts_Projection: { en: "Non-Allocable Costs (Projection)", de: "BWK Nicht-Umlagefähig (Annahme Weiterentwicklung)" },
    TotalCosts_Projection: { en: "Total Costs (Projection)", de: "BWK Gesamt (Annahme Weiterentwicklung)" },
  },

  // ----------------------------------------------------------------------------
  // 9. Tenancy (Vermietung)
  // ----------------------------------------------------------------------------
  Tenancy: {
    IsRented: { en: "Is Rented", de: "Vermietet" },
    TenancyStartDate: { en: "Tenancy Start Date", de: "Vermietet ab" },
    TenancyEndDate: { en: "Tenancy End Date", de: "Vermietet bis" },
    TenancyType: { en: "Tenancy Type", de: "Vermietungsart" },
    TenancyUnits: { en: "Tenancy Units", de: "Vermietungsanzahl" },
    TenancyUnitsPrice: { en: "Tenancy Units Price", de: "Preis Vermietungsanzahl" },
    ParkingSpaceRent: { en: "Parking Space Rent", de: "Stellplatzmiete" },
    MiscRent: { en: "Miscellaneous Rent", de: "Miete Sonstiges" },
    WarmRent: { en: "Warm Rent", de: "Warmmiete" },
    ColdRent: { en: "Cold Rent", de: "Kaltmiete" },
  },

  // ----------------------------------------------------------------------------
  // 10. Financing (Finanzierung)
  // ----------------------------------------------------------------------------
  Financing: {
    NumberOfLoans: { en: "Number of Loans", de: "Darlehensanzahl" },
    WeightedLoanAmount: { en: "Weighted Loan Amount", de: "Darlehenssumme (gewichtet)" },
    WeightedEquity: { en: "Weighted Equity", de: "Eigenkapital (gewichtet)" },
    WeightedInterestRate: { en: "Weighted Interest Rate", de: "Zinssatz (gewichtet)" },
    WeightedRepaymentRate: { en: "Weighted Repayment Rate", de: "Tilgungsrate (gewichtet)" },
    WeightedMonthlyDebtService: { en: "Weighted Monthly Debt Service", de: "Kapitaldienst/Monat (gewichtet)" },
    SingleLoanAmount: { en: "Single Loan Amount", de: "Darlehenssumme (single)" },
    SingleEquity: { en: "Single Equity", de: "Eigenkapital (single)" },
    SingleInterestRate: { en: "Single Interest Rate", de: "Zinssatz (single)" },
    SingleRepaymentRate: { en: "Single Repayment Rate", de: "Tilgungsrate (single)" },
    SingleMonthlyDebtService: { en: "Single Monthly Debt Service", de: "Kapitaldienst/Monat (single)" },
    SingleRepaymentStartDate: { en: "Single Repayment Start Date", de: "Tilgung ab (single)" },
    FixedInterestPeriod: { en: "Fixed Interest Period", de: "Zinsbindung" },
    InterestRate: { en: "Interest Rate", de: "Zinssatz" },
    RegularInterestRate: { en: "Regular Interest Rate (before Modification)", de: "Zinssatz regulär (vor Modifikation)" },
  },

  // ----------------------------------------------------------------------------
  // 11. FinancingCalculation (Finanzierungsberechnung)
  // ----------------------------------------------------------------------------
  FinancingCalculation: {
    Month: { en: "Month", de: "Monat" },
    MonthlyDebtService: { en: "Monthly Debt Service", de: "Kapitaldienst/Monat" },
    SingleMonthlyDebtService: { en: "Single Monthly Debt Service", de: "Kapitaldienst/Monat (single)" },
    InterestPortion: { en: "Interest Portion", de: "Zinsanteil" },
    RepaymentPortion: { en: "Repayment Portion", de: "Tilgungsanteil" },
    RemainingDebt: { en: "Remaining Debt", de: "Restschuld" },
    RepaymentYear: { en: "Repayment Year", de: "Tilgungsjahr" },
    RepaymentMonth: { en: "Repayment Month", de: "Tilgungsmonat" },
  },

  // ----------------------------------------------------------------------------
  // 12. InterestCalculation (Zinsberechnung)
  // ----------------------------------------------------------------------------
  InterestCalculation: {
    ModificationVariable: { en: "Modification Variable", de: "Modifikationsvariable" },
    FixedInterestPeriod: { en: "Fixed Interest Period", de: "Zinsbindung" },
    FixedInterestPeriodPercent: { en: "Fixed Interest Period (%)", de: "Zinsbindung Prozent" },
    EstimatedInterestRate: { en: "Estimated Interest Rate", de: "Zins geschätzt" },
    LoanToValueEquityShare: { en: "Loan-to-Value / Equity Share", de: "Beleihung / EK-Anteil" },
    EquityThresholds: { en: "Equity Thresholds", de: "EK Schwellenwerte" },
    EquityThresholdsCorridor: { en: "Equity Thresholds Corridor", de: "EK Schwellenwerte Korridor" },
    EquityThresholdsPercent: { en: "Equity Thresholds (%)", de: "EK Schwellenwerte %" },
  },

  // ----------------------------------------------------------------------------
  // 13. Depreciation (AfA)
  // ----------------------------------------------------------------------------
  Depreciation: {
    DepreciationType: { en: "Depreciation Type", de: "AfA Art" },
    DepreciationCalculation: { en: "Depreciation Calculation", de: "AfA Berechnung" },
    DepreciationYear: { en: "Depreciation Year", de: "AfA Jahr" },
  },

  // ----------------------------------------------------------------------------
  // 14. DepreciationCalculation (AfA-Berechnung)
  // ----------------------------------------------------------------------------
  DepreciationCalculation: {
    ResidentialType: { en: "Residential Type", de: "Wohnart" },
    RoofRenewal: { en: "Roof Renewal incl. Insulation", de: "Dacherneuerung inkl. Dämmung" },
    WindowsExteriorDoors: { en: "Windows & Exterior Doors", de: "Fenster & Außentüren" },
    PipingSystems: { en: "Piping Systems (Electrical etc.)", de: "Leitungssysteme (Strom etc.)" },
    HeatingSystem: { en: "Heating System", de: "Heizungsanlage" },
    ExteriorWallInsulation: { en: "Exterior Wall Insulation", de: "Dämmung Außenwände" },
    Bathrooms: { en: "Bathrooms", de: "Bäder" },
    InteriorFitting: { en: "Interior Fitting (excl. Bathrooms)", de: "Innenausbau (exkl. Bäder)" },
    FloorplanImprovement: { en: "Significant Floorplan Improvement", de: "Wesentliche Verbesserung der Grundrissgestaltung" },
    ModernisationPoints: { en: "Modernisation Points", de: "Modernisierungspunkte" },
    Age: { en: "Age", de: "Alter" },
    TotalUsefulLife: { en: "Total Useful Life", de: "Gesamtnutzungsdauer" },
    RemainingUsefulLifeYears: { en: "Remaining Useful Life (Years)", de: "RND in Jahren" },
    DepreciationRatePercent: { en: "Depreciation Rate (%)", de: "AfA in %" },
  },

  // ----------------------------------------------------------------------------
  // 15. BuildingProportion (Anteil Gebäude)
  // ----------------------------------------------------------------------------
  BuildingProportion: {
    Numerator: { en: "Numerator", de: "Zähler" },
    Denominator: { en: "Denominator", de: "Nenner" },
    TotalArea: { en: "Total Area", de: "Gesamtfläche" },
    TotalAreaShare: { en: "Total Area Share", de: "Gesamtfläche Anteil" },
    LandValue: { en: "Land Value", de: "Bodenwert" },
    LandAndSoil: { en: "Land and Soil", de: "Grund und Boden" },
    BuildingFactor: { en: "Building Factor", de: "Faktor Gebäude" },
    BuildingValue: { en: "Building Value", de: "Gebäudewert" },
    AncillaryCostShare: { en: "Ancillary Cost Share", de: "Kaufnebenkosten Anteil" },
    BuildingDepreciation: { en: "Building Depreciation", de: "Abschreibung Gebäude" },
  },

  // ----------------------------------------------------------------------------
  // 16. Renovation (Sanierung)
  // ----------------------------------------------------------------------------
  Renovation: {
    LastModernisation: { en: "Last Modernisation", de: "Letzte Modernisierung" },
    LastModernisation_Relevance: { en: "Last Modernisation Relevance", de: "Letzte Modernisierung Relevanz" },
    LastModernisation_Value: { en: "Last Modernisation Value", de: "Letzte Modernisierung Wert" },
    LastModernisation_Percent: { en: "Last Modernisation (%)", de: "Letzte Modernisierung Prozent" },
    Modernisation_Property: { en: "Modernisation Property", de: "Modernisierung Objekt" },
    Modernisation_Date: { en: "Modernisation Date", de: "Modernisierung Datum" },
    Modernisation_Value: { en: "Modernisation Value", de: "Modernisierung Wert" },
    Limit_15Percent: { en: "15% Limit", de: "Grenze 15%" },
    ThreeYear_Value: { en: "3-Year Value", de: "3-Jahreswert" },
    PurchaseDepreciation: { en: "Purchase Depreciation", de: "Abschreibung Kauf" },
  },

  // ----------------------------------------------------------------------------
  // 17. MetricsToday (Kennzahlen heute)
  // ----------------------------------------------------------------------------
  MetricsToday: {
    Factor: { en: "Factor", de: "Faktor" },
    Taxes: { en: "Taxes", de: "Steuern" },
  },

  // ----------------------------------------------------------------------------
  // 18. DevelopmentTomorrow (Entwicklung morgen)
  // ----------------------------------------------------------------------------
  DevelopmentTomorrow: {
    DevelopmentYear: { en: "Development Year", de: "Entwicklungsjahr" },
    YearStart: { en: "Year Start", de: "Jahr Start" },
    DateStart: { en: "Date Start", de: "Datum Start" },
    ColdRentIncrease: { en: "Cold Rent Increase", de: "Miete Kalt Erhöhung" },
    ColdRentIncrease_Eligible: { en: "Cold Rent Increase Eligible", de: "Miete Kalt Erhöhung berechtigt" },
    ColdRentIncrease_LockPeriod: { en: "Cold Rent Increase Lock Period", de: "Miete Kalt Erhöhung Sperrfrist" },
    ColdRentIncrease_Reminder: { en: "Cold Rent Increase Reminder", de: "Miete Kalt Erhöhung Erinnerung" },
    ColdRentIncrease_Percent: { en: "Cold Rent Increase (%)", de: "Miete Kalt Erhöhung Prozent" },
    ColdRentIncrease_3YrAvgPct: { en: "Cold Rent Increase 3-Year Average (%)", de: "Miete Kalt Erhöhung 3-Jahresdurchschnitt Prozent" },
    MetropolitanArea: { en: "Metropolitan Area", de: "Ballungsgebiet" },
    LastRentIncrease: { en: "Last Rent Increase", de: "Letzte Mieterhöhung" },
    LastRentIncrease_Relevance: { en: "Last Rent Increase Relevance", de: "Letzte Mieterhöhung Relevanz" },
    LastRentIncrease_Value: { en: "Last Rent Increase Value", de: "Letzte Mieterhöhung Wert" },
    LastRentIncrease_Percent: { en: "Last Rent Increase (%)", de: "Letzte Mieterhöhung Prozent" },
    Dev_SqmPrice_WithRentIndex: { en: "Development sqm Price (with Rent Index)", de: "Entwicklung qm mit Mietspiegel" },
    Dev_SqmPrice_WithoutRentIndex: { en: "Development sqm Price (without Rent Index)", de: "Entwicklung qm ohne Mietspiegel" },
    Dev_TotalRent_WithRentIndex: { en: "Development Total Rent (with Rent Index)", de: "Entwicklung Gesamtmiete mit Mietspiegel" },
    Dev_TotalRent_WithoutRentIndex: { en: "Development Total Rent (without Rent Index)", de: "Entwicklung Gesamtmiete ohne Mietspiegel" },
    Dev_DebtServiceDiff_WithRI: { en: "Debt Service Difference (with Rent Index)", de: "Entwicklung Differenz Kapitaldienst mit Mietspiegel" },
    Dev_DebtServiceDiff_WithoutRI: { en: "Debt Service Difference (without Rent Index)", de: "Entwicklung Differenz Kapitaldienst ohne Mietspiegel" },
    Dev_NetRentYield_PreTax_WithRI: { en: "Net Rent Yield pre-Tax (with Rent Index)", de: "Entwicklung Nettomietrendite vor Steuer mit Mietspiegel" },
    Dev_NetRentYield_PreTax_WithoutRI: { en: "Net Rent Yield pre-Tax (without Rent Index)", de: "Entwicklung Nettomietrendite vor Steuer ohne Mietspiegel" },
    Dev_NetRentYield_AfterTax_WithRI: { en: "Net Rent Yield after-Tax (with Rent Index)", de: "Entwicklung Nettomietrendite nach Steuer mit Mietspiegel" },
    Dev_NetRentYield_AfterTax_WithoutRI: { en: "Net Rent Yield after-Tax (without Rent Index)", de: "Entwicklung Nettomietrendite nach Steuer ohne Mietspiegel" },
    OperativeCashflow_WithRI: { en: "Operative Cashflow (with Rent Index)", de: "Cashflow operativ mit Mietspiegel" },
    OperativeCashflow_WithoutRI: { en: "Operative Cashflow (without Rent Index)", de: "Cashflow operativ ohne Mietspiegel" },
    AfterTaxCashflow_WithRI: { en: "After-Tax Cashflow (with Rent Index)", de: "Cashflow nach Steuer mit Mietspiegel" },
    AfterTaxCashflow_WithoutRI: { en: "After-Tax Cashflow (without Rent Index)", de: "Cashflow nach Steuer ohne Mietspiegel" },
  },

  // ----------------------------------------------------------------------------
  // 19. City (Stadt)
  // ----------------------------------------------------------------------------
  City: {
    CityName: { en: "City Name", de: "Stadt" },
    BuildingShare: { en: "Building Share", de: "Anteil Gebäude" },
    LandShare: { en: "Land Share", de: "Anteil Grund und Boden" },
    MetropolitanArea: { en: "Metropolitan Area", de: "Ballungsgebiet Stadt" },
  },

  // ----------------------------------------------------------------------------
  // 20. RentIndex (Mietspiegel)
  // ----------------------------------------------------------------------------
  RentIndex: {
    ValidFrom: { en: "Valid From", de: "Gültig ab" },
    ValidUntil: { en: "Valid Until", de: "Gültig bis" },
    Methodology: { en: "Methodology", de: "Methodik" },
    ReferenceRents: { en: "Reference Rents", de: "Referenzmieten" },
  },

  // ----------------------------------------------------------------------------
  // 21. LegalRequirements (Gesetzliche Vorgaben)
  // ----------------------------------------------------------------------------
  LegalRequirements: {
    RentCapLimit: { en: "Rent Cap Limit", de: "Kappungsgrenze" },
    SqmIncrease_Low: { en: "sqm Increase Low", de: "qm-Erhöhung niedrig" },
    SqmIncrease_High: { en: "sqm Increase High", de: "qm-Erhöhung hoch" },
    RenovationLimit_Percent: { en: "Renovation Limit (%)", de: "Sanierungsgrenze in %" },
  },

  // ----------------------------------------------------------------------------
  // 22. SystemData (Systemdaten)
  // ----------------------------------------------------------------------------
  SystemData: {
    CurrentYear: { en: "Current Year", de: "Aktuelles Jahr" },
  },

  // ----------------------------------------------------------------------------
  // 23. Notifications (Benachrichtigungen)
  // ----------------------------------------------------------------------------
  Notifications: {
    Tradesperson: { en: "Tradesperson", de: "Handwerker" },
    FinancialBroker: { en: "Financial Broker", de: "Finanzvermittler" },
  },

  // ----------------------------------------------------------------------------
  // 24. QuickCheck (Ersteinschätzung)
  // ----------------------------------------------------------------------------
  QuickCheck: {
    IngestDate:          { en: "Capture Date",    de: "Erfassungsdatum" },
    PortalId:            { en: "Portal ID",       de: "Portal ID" },
    KpfMultiplier:       { en: "KPF",      de: "KPF" },
    PurchasePrice:       { en: "Purchase Price",  de: "Kaufpreis" },
    PostalCode:          { en: "Postal Code",     de: "PLZ" },
    ConstructionYear:    { en: "Year of Const.",  de: "Baujahr" },
    Condition:           { en: "Condition",       de: "Zustand" },
    Status:              { en: "Status",          de: "Status" },
    SearchPlaceholder:   { en: "Search by portal, postal code, condition…", de: "Suche nach Portal, PLZ, Zustand…" },
  },

} as const;

// ----------------------------------------------------------------------------
// Helper: get a single label by table, field and language
// Usage: getLabel("Property", "SquareMeters", "de") → "Quadratmeter"
// ----------------------------------------------------------------------------
export function getLabel(
  table: keyof typeof FieldLabels,
  field: string,
  lang: Language = "en"
): string {
  const entry = FieldLabels[table]?.[field] as TranslatedLabel | undefined;
  return entry ? entry[lang] : field;
}

// ----------------------------------------------------------------------------
// Helper: get all labels for a table in a given language
// Usage: getTableLabels("Tenancy", "de") → { IsRented: "Vermietet", ... }
// ----------------------------------------------------------------------------
export function getTableLabels(
  table: keyof typeof FieldLabels,
  lang: Language = "en"
): Record<string, string> {
  const tableLabels = FieldLabels[table];
  if (!tableLabels) return {};
  return Object.fromEntries(
    Object.entries(tableLabels).map(([field, labels]) => [
      field,
      (labels as TranslatedLabel)[lang],
    ])
  );
}