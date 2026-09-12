// Shared TypeScript types for ImmoAndTheBrain

// ----------------------------------------------------------------------------
// City
// ----------------------------------------------------------------------------

export type MarketTierType = 'A' | 'B' | 'C' | 'D';

export enum Designation {
  Barbarossastadt = "Barbarossastadt",
  Barlachstadt = "Barlachstadt",
  BergUndUniversitaetsstadt = "Berg- und Universitätsstadt",
  Bergringstadt = "Bergringstadt",
  Bernsteinstadt = "Bernsteinstadt",
  Blumenstadt = "Blumenstadt",
  Bluetenstadt = "Blütenstadt",
  BruederGrimmStadt = "Brüder-Grimm-Stadt",
  Buechnerstadt = "Büchnerstadt",
  DieMaehdrescherstadt = "Die Mähdrescherstadt",
  DomUndKaiserstadt = "Dom- und Kaiserstadt",
  Einhardstadt = "Einhardstadt",
  FreieUndHansestadt = "Freie und Hansestadt",
  FriedrichLudwigWeidigStadt = "Friedrich-Ludwig-Weidig-Stadt",
  FundortDesNeanderthalers = "Fundort des Neanderthalers",
  Gkst = "GKSt",
  Glockenstadt = "Glockenstadt",
  Goethestadt = "Goethestadt",
  HansStadenStadt = "Hans-Staden-Stadt",
  HanseUndUniversitaetsstadt = "Hanse- und Universitätsstadt",
  Hansestadt = "Hansestadt",
  HansestadtAnDerRuhr = "Hansestadt an der Ruhr",
  Hochschulstadt = "Hochschulstadt",
  Inselstadt = "Inselstadt",
  Karolingerstadt = "Karolingerstadt",
  Klingenstadt = "Klingenstadt",
  Kolpingstadt = "Kolpingstadt",
  Konfirmationsstadt = "Konfirmationsstadt",
  KonradZuseStadt = "Konrad-Zuse-Stadt",
  KreisUndHochschulstadt = "Kreis- und  Hochschulstadt",
  Kreisstadt = "Kreisstadt",
  Kupferstadt = "Kupferstadt",
  Kurort = "Kurort",
  Landeshauptstadt = "Landeshauptstadt",
  Liebenbachstadt = "Liebenbachstadt",
  Loreleystadt = "Loreleystadt",
  Lutherstadt = "Lutherstadt",
  Muenchhausenstadt = "Münchhausenstadt",
  Nationalparkstadt = "Nationalparkstadt",
  Oranienstadt = "Oranienstadt",
  Orgelstadt = "Orgelstadt",
  Ostseebad = "Ostseebad",
  Peenestadt = "Peenestadt",
  PhilippSoldanStadt = "Philipp-Soldan-Stadt",
  Reformationsstadt = "Reformationsstadt",
  Residenzstadt = "Residenzstadt",
  Reuterstadt = "Reuterstadt",
  Schliemannstadt = "Schliemannstadt",
  SchlossStadt = "Schloss-Stadt",
  Schoefferstadt = "Schöfferstadt",
  Seebad = "Seebad",
  Sickingenstadt = "Sickingenstadt",
  Solestadt = "Solestadt",
  St = "St",
  Stadt = "Stadt",
  StadtBAWoda = "Stadt / Běła Woda",
  StadtAufDerHoehe = "Stadt auf der Höhe",
  StadtDerBurgmannshoefe = "Stadt der Burgmannshöfe",
  StadtDerFernuniversitaet = "Stadt der FernUniversität",
  StadtDerKluterthoehle = "Stadt der Kluterthöhle",
  StadtDerOsterraeder = "Stadt der Osterräder",
  UniversitaetsUndHansestadt = "Universitäts- und Hansestadt",
  Universitaetsstadt = "Universitätsstadt",
  VierToreStadt = "Vier-Tore-Stadt",
  Warbelstadt = "Warbelstadt",
  Welterbestadt = "Welterbestadt",
  Widukindstadt = "Widukindstadt",
  Windmuehlenstadt = "Windmühlenstadt",
  Wissenschaftsstadt = "Wissenschaftsstadt",
  DocumentaStadt = "documenta-Stadt",
}

export interface City {
  cityId: number;
  cityName: string;
  buildingShare: number;
  landShare: number;
  population: number;
  marketTier: MarketTierType;
  designation: Designation;
  createdAt: string;
  updatedAt: string;
}

export type CityInsert = Omit<City, 'cityId' | 'createdAt' | 'updatedAt'>;
export type CityUpdate = Partial<CityInsert>;

// ----------------------------------------------------------------------------
// Property
// ----------------------------------------------------------------------------

export enum PropertyCondition {
  InNeedOfRenovation = 'Sanierungsbedürftig',
  Standard = 'Standard',
  Upscale = 'Gehoben',
  Luxury = 'Luxus',
}

export enum PropertyTypeValues {
  Condominium = 'Eigentumswohnung',
  SingleFamilyHouse = 'Einfamilienhaus',
  MultiFamilyHouse = 'Mehrfamilienhaus',
  TimberConstruction = 'Holzbauweise',
  ListedBuildings = 'Denkmalgeschützte Gebäude',
}

export enum EnergyEfficient {
  APlus = 'A+',
  A = 'A',
  B = 'B',
  C = 'C',
  D = 'D',
  E = 'E',
  F = 'F',
  G = 'G',
  H = 'H',
}

export interface Property {
  propertyId: number;
  userId: string;
  cityId: number | null;
  propertyAbbreviation: string | null;
  street: string;
  houseNumber: string;
  yearOfConstruction: number;
  energyEfficient: EnergyEfficient | null;
  imageUrl: string | null;
  city: string;
  postalCode: string;
  federalState: string;
  squareMeters: number;
  numberOfRooms: number | null;
  /** Objekttyp, e.g. EIGENTUMSWOHNUNG — free text, no DB enum. */
  propertyCategory: string | null;
  /** How many rentable Wohneinheiten this property has. */
  numberOfUnits: number;
  /** Non-null once archived from the Bestandsobjekte overview — hidden from
   *  the default list, still reachable via "Verlauf". */
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export type PropertyInsert = Omit<Property, 'propertyId' | 'createdAt' | 'updatedAt'>;
export type PropertyUpdate = Partial<Omit<Property, 'propertyId' | 'userId' | 'createdAt' | 'updatedAt'>>;

/** One photo in a property's gallery — `Property.imageUrl` is a denormalized
 *  cache of whichever row here currently has `isCover: true`. */
export interface PropertyImage {
  propertyImageId: number;
  propertyId: number;
  storagePath: string;
  publicUrl: string;
  isCover: boolean;
  createdAt: string;
}

// ----------------------------------------------------------------------------
// PropertySaleListing
// ----------------------------------------------------------------------------

export type SaleListingCondition = 'Standard' | 'Luxus' | 'Renovierungsbedürftig';

export type SaleListingHeatingType =
  | 'Gasheizung'
  | 'Ölheizung'
  | 'Fernwärme / Nahwärme'
  | 'Kohleheizung'
  | 'Wärmepumpe (Luft-Wasser)'
  | 'Wärmepumpe (Sole-Wasser / Erdwärme)'
  | 'Wärmepumpe (Wasser-Wasser / Grundwasser)'
  | 'Pelletheizung'
  | 'Hackschnitzelheizung'
  | 'Scheitholzheizung / Holzvergaserkessel'
  | 'Solarthermie (Heizungsunterstützung)'
  | 'Hybridheizung (z. B. Gas + Wärmepumpe)'
  | 'Elektro-Direktheizung'
  | 'Nachtspeicherheizung'
  | 'Infrarotheizung';

export type SaleListingParkingType = 'Garage' | 'Duplex-Stellplatz' | 'Außen überdacht' | 'Außen unüberdacht';

export type PropertySaleListingStatus = 'draft' | 'published';

/**
 * A standalone "Vorbereiten für Verkauf" snapshot — initialized from
 * property/tenancy/parking-space data on first open, then edited and saved
 * independently. Editing a listing never writes back to the live property
 * record.
 */
export interface PropertySaleListing {
  propertySaleListingId: number;
  propertyId: number;
  street: string | null;
  houseNumber: string | null;
  postalCode: string | null;
  city: string | null;
  squareMeters: number | null;
  condition: SaleListingCondition | null;
  yearOfConstruction: number | null;
  energyEfficient: EnergyEfficient | null;
  floor: number | null;
  numberOfRooms: number | null;
  heatingType: SaleListingHeatingType | null;
  isRented: boolean | null;
  coldRent: number | null;
  serviceCharges: number | null;
  parkingSpaceCount: number | null;
  parkingSpaceType: SaleListingParkingType | null;
  salePrice: number | null;
  parkingSpaceSalePrice: number | null;
  availableFrom: string | null;
  brokerCommissionPercent: number | null;
  description: string | null;
  status: PropertySaleListingStatus;
  publishedAt: string | null;
  selectedPortals: string[];
  createdAt: string;
  updatedAt: string;
}

export type PropertySaleListingInsert = Omit<PropertySaleListing, 'propertySaleListingId' | 'createdAt' | 'updatedAt'>;
export type PropertySaleListingUpdate = Partial<Omit<PropertySaleListing, 'propertySaleListingId' | 'propertyId' | 'createdAt' | 'updatedAt'>>;

// ----------------------------------------------------------------------------
// PropertyDocument
// ----------------------------------------------------------------------------

export type PropertyDocumentType = 'Energieausweis' | 'Grundriss' | 'Sonstiges';

/** Files attached to a property (Energieausweis/Grundriss/Sonstiges) —
 *  mirrors TenancyDocument, minus the tenancy dimension. */
export interface PropertyDocument {
  propertyDocumentId: number;
  propertyId: number;
  documentType: PropertyDocumentType;
  fileName: string;
  storagePath: string;
  contentType: string | null;
  fileSize: number | null;
  createdAt: string;
  updatedAt: string;
  supersededAt: string | null;
}

// ----------------------------------------------------------------------------
// PropertyUnit
// ----------------------------------------------------------------------------

export enum UnitUsageType {
  Wohnung = 'WOHNUNG',
  Einliegerwohnung = 'EINLIEGERWOHNUNG',
  Stellplatz = 'STELLPLATZ',
  Gewerbeflaeche = 'GEWERBEFLAECHE',
  Lager = 'LAGER',
  Sonstige = 'SONSTIGE',
}

export interface PropertyUnit {
  propertyUnitId: number;
  propertyId: number;
  unitLabel: string;
  sortOrder: number;
  usageType: UnitUsageType;
  floor: string | null;
  locationNote: string | null;
  livingAreaM2: number | null;
  numberOfRooms: number | null;
  yearOfConstruction: number | null;
  energyEfficient: EnergyEfficient | null;
  numberOfParkingSpaces: number;
  targetColdRent: number | null;
  targetParkingRent: number | null;
  targetAncillaryCosts: number | null;
  createdAt: string;
  updatedAt: string;
}

export type PropertyUnitInsert = Omit<PropertyUnit, 'propertyUnitId' | 'createdAt' | 'updatedAt'>;
export type PropertyUnitUpdate = Partial<Omit<PropertyUnit, 'propertyUnitId' | 'propertyId' | 'createdAt' | 'updatedAt'>>;

export interface PropertyWithCity extends Property {
  cityRel: {
    cityId: number;
    cityName: string;
    metropolitanArea: string;
    buildingShare: number;
    landShare: number;
  };
}

// ----------------------------------------------------------------------------
// PersonalData
// ----------------------------------------------------------------------------

export interface PersonalData {
  userId: string;
  lastName: string;
  firstName: string;
  street: string;
  houseNumber: string;
  city: string;
  postalCode: string;
  phoneNumber?: string;
  emailAddress: string;
  taxIdentificationNumber: string;
  profilePicture?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export type PersonalDataInsert = Omit<PersonalData, 'createdAt' | 'updatedAt'>;
export type PersonalDataUpdate = Partial<Omit<PersonalData, 'userId' | 'createdAt' | 'updatedAt'>>;

// ----------------------------------------------------------------------------
// Subscription
// ----------------------------------------------------------------------------

export interface Subscription {
  subscriptionId: number;
  userId: string;
  subscriptionModel: 'Basic' | 'Professional' | 'Enterprise';
  startDate: string;
  endDate: string | null;
  createdAt: string;
  updatedAt: string;
}

export type SubscriptionInsert = Omit<Subscription, 'subscriptionId' | 'createdAt' | 'updatedAt'>;
export type SubscriptionUpdate = Partial<Omit<Subscription, 'subscriptionId' | 'userId' | 'createdAt' | 'updatedAt'>>;

// ----------------------------------------------------------------------------
// Password
// ----------------------------------------------------------------------------

export interface Password {
  passwordId: number;
  userId: string;
  passwordHash: string;
  createdAt: string;
  updatedAt: string;
}

export type PasswordInsert = Omit<Password, 'passwordId' | 'createdAt' | 'updatedAt'>;
export type PasswordUpdate = Partial<Omit<Password, 'passwordId' | 'userId' | 'createdAt' | 'updatedAt'>>;

// ----------------------------------------------------------------------------
// ParkingSpace
// ----------------------------------------------------------------------------

export type ParkingSpaceType = 'GARAGE' | 'CARPORT' | 'OUTDOOR' | 'UNDERGROUND' | 'OTHER';

export interface ParkingSpace {
  parkingSpaceId: number;
  propertyId: number;
  parkingSpaceType: ParkingSpaceType | null;
  numberOfParkingSpaces: number | null;
  createdAt: string;
  updatedAt: string;
}

export type ParkingSpaceInsert = Omit<ParkingSpace, 'parkingSpaceId' | 'createdAt' | 'updatedAt'>;
export type ParkingSpaceUpdate = Partial<Omit<ParkingSpace, 'parkingSpaceId' | 'createdAt' | 'updatedAt'>>;

// ----------------------------------------------------------------------------
// PropertyAcquisition
// ----------------------------------------------------------------------------

export interface PropertyAcquisition {
  propertyAcquisitionId: number;
  propertyId: number;
  houseCompletionYear: number | null;
  purchaseDate: string | null;
  transferDate: string | null;
  createdAt: string;
  updatedAt: string;
}

export type PropertyAcquisitionInsert = Omit<PropertyAcquisition, 'propertyAcquisitionId' | 'createdAt' | 'updatedAt'>;
export type PropertyAcquisitionUpdate = Partial<Omit<PropertyAcquisition, 'propertyAcquisitionId' | 'createdAt' | 'updatedAt'>>;

// ----------------------------------------------------------------------------
// PropertyRnd
// ----------------------------------------------------------------------------

export type RndMode = 'STANDARD' | 'INDIVIDUAL';

export interface PropertyRnd {
  propertyRndId: number;
  propertyId: number;
  rndMode: RndMode;
  modernizationRoof: string | null;
  modernizationWindows: string | null;
  modernizationLines: string | null;
  modernizationHeating: string | null;
  modernizationFacade: string | null;
  modernizationBathrooms: string | null;
  modernizationInterior: string | null;
  remainingUsefulLifeYears: number;
  afaPercent: number;
  createdAt: string;
  updatedAt: string;
}

export type PropertyRndInsert = Omit<PropertyRnd, 'propertyRndId' | 'createdAt' | 'updatedAt'>;
export type PropertyRndUpdate = Partial<Omit<PropertyRnd, 'propertyRndId' | 'propertyId' | 'createdAt' | 'updatedAt'>>;

// ----------------------------------------------------------------------------
// PropertyPriceSplit
// ----------------------------------------------------------------------------

export type PriceSplitMode = 'STANDARD' | 'INDIVIDUAL';

export interface PropertyPriceSplit {
  propertyPriceSplitId: number;
  propertyId: number;
  splitMode: PriceSplitMode;
  plotAreaM2: number | null;
  landReferenceValue: number | null;
  coOwnershipNumerator: number | null;
  coOwnershipDenominator: number | null;
  createdAt: string;
  updatedAt: string;
}

export type PropertyPriceSplitInsert = Omit<PropertyPriceSplit, 'propertyPriceSplitId' | 'createdAt' | 'updatedAt'>;
export type PropertyPriceSplitUpdate = Partial<Omit<PropertyPriceSplit, 'propertyPriceSplitId' | 'propertyId' | 'createdAt' | 'updatedAt'>>;

// ----------------------------------------------------------------------------
// Tenancy
// ----------------------------------------------------------------------------

export enum TenancyTypeValues {
  Standard = 'Standard',
  IndexLinkedRent = 'Indexmiete',
  Usufruct = 'Nießbrauch',
  Leasehold = 'Erbpacht',
  SpecializedLeasing = 'Sondervermietung',
  Commercial = 'Gewerbe',
  NursingHome = 'Altenheim',
  ForeclosureSale = 'Zwangsversteigerung',
}

export interface Tenancy {
  tenancyId: number,
  maintenanceCostsId: number | null,
  parkingSpaceId: number | null,
  propertyId: number,
  propertyUnitId: number | null,
  isRented: boolean | null,
  tenancyStartDate: string | null,
  tenancyEndDate: string | null,
  tenancyType: TenancyTypeValues | null,
  tenancyUnits: number | null,
  tenancyUnitsPrice: number | null,
  parkingSpaceRent: number | null,
  miscRent: number | null,
  warmRent: number | null,
  coldRent: number | null,
  tenantFirstName: string,
  tenantLastName: string,
  deposit: number | null,
  /** Rental-agreement clauses (§§5-7 of the generated Mietvertrag) — all
   *  optional, filled in from the Mietvertrag generieren page. */
  nextRentAdjustmentDate?: string | null,
  nextRentAdjustmentAmount?: number | null,
  /** null = not captured yet, true = planned, false = not planned. */
  renovationAdjustmentPlanned?: boolean | null,
  /** Sanierungsanpassung scheduling, shown on the Mietvertrag tab. */
  renovationAdjustmentStartDate?: string | null,
  renovationAdjustmentEndDate?: string | null,
  renovationAdjustmentAmount?: number | null,
  /** Reminder-date overrides; null means "use the computed default" (-4
   *  months before the adjustment date) rather than "no reminder". */
  rentAdjustmentReminderDate?: string | null,
  renovationAdjustmentReminderDate?: string | null,
  /** Objektentwicklung "Kalkulationsbasis" inputs — NULL means "use the
   *  legal default" (see rentDevelopmentPlan.ts), not "zero". */
  rentIndexPerM2?: number | null,
  rentIncreaseIntervalMonths?: number | null,
  plannedRenovationCost?: number | null,
  petsAllowed?: RentalTermsPetsAllowed | null,
  redecorationClause?: RentalTermsRedecorationClause | null,
  subletAllowed?: RentalTermsSubletAllowed | null,
  additionalTerms?: string | null,
  /** Move-out checklist, shown on the Mieterhistorie table for ended
   *  tenancies — both default to false until the landlord ticks them off. */
  acceptanceProtocol?: boolean,
  depositPaidOut?: boolean,
  createdAt: string,
  updatedAt: string
}

export type RentalTermsPetsAllowed = 'Erlaubt' | 'Nicht erlaubt' | 'Nach Vereinbarung';
export type RentalTermsRedecorationClause = 'Mieter trägt Kosten (üblich)' | 'Vermieter trägt Kosten' | 'Individuelle Regelung';
export type RentalTermsSubletAllowed = 'Erlaubt' | 'Nicht erlaubt' | 'Nach Zustimmung';

export type TenancyInsert = Omit<Tenancy, 'tenancyId' | 'createdAt' | 'updatedAt'>;
export type TenancyUpdate = Partial<Omit<Tenancy, 'tenancyId' | 'propertyId' | 'createdAt' | 'updatedAt'>>;

// ----------------------------------------------------------------------------
// TenancyPerson
// ----------------------------------------------------------------------------

export interface TenancyPerson {
  tenancyPersonId: number;
  tenancyId: number;
  lastName: string | null;
  firstName: string | null;
  /** Steuer-ID (opt.) */
  taxId: string | null;
  isPrimary: boolean;
  sortOrder: number;
  /** Einzug — each co-tenant can move in on a different date. */
  moveInDate: string | null;
  createdAt: string;
  updatedAt: string;
}

export type TenancyPersonInsert = Omit<TenancyPerson, 'tenancyPersonId' | 'createdAt' | 'updatedAt'>;
export type TenancyPersonUpdate = Partial<Omit<TenancyPerson, 'tenancyPersonId' | 'tenancyId' | 'createdAt' | 'updatedAt'>>;

// ----------------------------------------------------------------------------
// TenancyDocument
// ----------------------------------------------------------------------------

export type TenancyDocumentType = 'Ausweis' | 'Schufa' | 'Bürgschaft' | 'Gehaltsnachweise' | 'Vormieterbescheinigung' | 'Sonstiges' | 'Mietvertrag' | 'Mieterbescheinigung' | 'Mieterhöhungsschreiben' | 'Sanierungsanpassungsschreiben' | 'Abnahme' | 'Nebenkostenabrechnung' | 'Nebenkosten-Anpassungsschreiben';

export interface TenancyDocument {
  tenancyDocumentId: number;
  tenancyId: number;
  /** Null for tenancy-wide documents (Mietvertrag). */
  tenancyPersonId: number | null;
  documentType: TenancyDocumentType;
  fileName: string;
  storagePath: string;
  contentType: string | null;
  fileSize: number | null;
  createdAt: string;
  updatedAt: string;
  /** Set when a newer upload replaced this document for the same
   *  (tenancy, documentType, tenancyPersonId) slot. Null = current version. */
  supersededAt: string | null;
}

export type TenancyDocumentInsert = Omit<TenancyDocument, 'tenancyDocumentId' | 'createdAt' | 'updatedAt' | 'supersededAt'>;

// ----------------------------------------------------------------------------
// TenancyMoveOut (Mieterauszug)
// ----------------------------------------------------------------------------

export interface MoveOutMeterReading {
  id: string;
  room: string;
  value: number | null;
}

export interface MoveOutDamagePhoto {
  path: string;
  fileName: string;
}

export interface MoveOutDamage {
  id: string;
  description: string;
  photos: MoveOutDamagePhoto[];
}

export interface TenancyMoveOut {
  tenancyMoveOutId: number;
  tenancyId: number;
  propertyId: number;
  meterReadings: MoveOutMeterReading[];
  damages: MoveOutDamage[];
  createdAt: string;
  updatedAt: string;
}

export type TenancyMoveOutInsert = Omit<TenancyMoveOut, 'tenancyMoveOutId' | 'createdAt' | 'updatedAt'>;
export type TenancyMoveOutUpdate = Partial<Omit<TenancyMoveOut, 'tenancyMoveOutId' | 'tenancyId' | 'propertyId' | 'createdAt' | 'updatedAt'>>;

export enum DataEntryTypeValues {
  ImportFromRealEstatePortal = 'Aus Immobilienportal importieren',
  ManualEntry = 'Manuell erfassen',
  ExposeScan = 'Exposé einlesen',
}

// ----------------------------------------------------------------------------
// AcquisitionCosts
// ----------------------------------------------------------------------------

export interface AcquisitionCosts {
  acquisitionCostsId: number;
  propertyId: number;
  parkingSpaceId: number | null;
  propertyPurchasePrice: number;
  pricePerSqm: number | null;
  broker: number | null;
  brokerValue: number | null;
  notary: number | null;
  notaryValue: number | null;
  landRegistry: number | null;
  landRegistryValue: number | null;
  realEstateTax: number | null;
  realEstateTaxValue: number | null;
  adjustmentVariable: number | null;
  adjustmentVariableValue: number | null;
  totalAncillaryCostsValue: number | null;
  totalAncillaryCosts: number | null;
  parkingSpacePurchasePrice: number | null;
  createdAt: string;
  updatedAt: string;
}

export type AcquisitionCostsInsert = Omit<AcquisitionCosts, 'acquisitionCostsId' | 'createdAt' | 'updatedAt'>;
export type AcquisitionCostsUpdate = Partial<Omit<AcquisitionCosts, 'acquisitionCostsId' | 'propertyId' | 'createdAt' | 'updatedAt'>>;

// ----------------------------------------------------------------------------
// MaintenanceCosts
// ----------------------------------------------------------------------------

export interface MaintenanceCostItem {
  id: string;
  label: string;
  amount: number;
  /** true = umlagefähig, false = nicht umlagefähig. */
  allocable: boolean;
}

export interface MaintenanceCosts {
  maintenanceCostsId: number;
  propertyId: number;
  costBreakdown: boolean;
  allocableCosts: number | null;
  nonAllocableCosts: number | null;
  totalCosts: number | null;
  houseMoney: number | null;
  allocableCostsProjection: boolean;
  nonAllocableCostsProjection: boolean;
  totalCostsProjection: boolean;
  /** Itemized Nebenkosten breakdown entered via "Detailerfassung
   *  Nebenkosten"; allocableCosts/nonAllocableCosts are kept as the summed
   *  totals of this list once it's used. */
  costItems?: MaintenanceCostItem[] | null;
  createdAt: string;
  updatedAt: string;
}

export type MaintenanceCostsInsert = Omit<MaintenanceCosts, 'maintenanceCostsId' | 'createdAt' | 'updatedAt'>;
export type MaintenanceCostsUpdate = Partial<Omit<MaintenanceCosts, 'maintenanceCostsId' | 'propertyId' | 'createdAt' | 'updatedAt'>>;

// ----------------------------------------------------------------------------
// TenancyAdjustmentHistory
// ----------------------------------------------------------------------------

export type TenancyAdjustmentType = 'rent' | 'renovation' | 'miscRent';

export interface TenancyAdjustmentHistoryEntry {
  historyId: number;
  tenancyId: number;
  propertyId: number;
  adjustmentType: TenancyAdjustmentType;
  effectiveDate: string | null;
  amount: number | null;
  note: string | null;
  createdAt: string;
  updatedAt: string;
}

export type TenancyAdjustmentHistoryInsert = Omit<TenancyAdjustmentHistoryEntry, 'historyId' | 'createdAt' | 'updatedAt'>;

// ----------------------------------------------------------------------------
// ServiceChargeSettlement (Nebenkostenabrechnung)
// ----------------------------------------------------------------------------

export interface ServiceChargeSettlement {
  serviceChargeSettlementId: number;
  propertyId: number;
  periodStart: string;
  periodEnd: string;
  sourceDocumentName: string | null;
  sourceDocumentPath: string | null;
  createdAt: string;
  updatedAt: string;
}

export type ServiceChargeSettlementInsert = Omit<ServiceChargeSettlement, 'serviceChargeSettlementId' | 'createdAt' | 'updatedAt'>;
export type ServiceChargeSettlementUpdate = Partial<Omit<ServiceChargeSettlement, 'serviceChargeSettlementId' | 'propertyId' | 'createdAt' | 'updatedAt'>>;

export interface ServiceChargeCostItem {
  serviceChargeCostItemId: number;
  serviceChargeSettlementId: number;
  propertyId: number;
  sortOrder: number;
  label: string;
  /** true = umlagefähig (recharged to tenants), false = nicht umlagefähig —
   *  excluded from the Anteil Wohnung recharge (e.g. Verwaltungskosten). */
  allocable: boolean;
  /** Abrechnung <settlement year> — actual incurred cost, whole building. */
  actualAmount: number | null;
  /** Wirtschaftsplan <settlement year + 1> — next year's budgeted cost, whole building. */
  budgetAmount: number | null;
  /** Manual override of the computed Abrechnung-year Anteil Wohnung for this
   *  row; null uses the automatic actualAmount * unit share calculation. */
  actualShareOverride: number | null;
  /** Manual override of the computed Wirtschaftsplan-year Anteil Wohnung for
   *  this row; null uses the automatic budgetAmount * unit share calculation. */
  budgetShareOverride: number | null;
  createdAt: string;
  updatedAt: string;
}

export type ServiceChargeCostItemInsert = Omit<ServiceChargeCostItem, 'serviceChargeCostItemId' | 'createdAt' | 'updatedAt'>;
export type ServiceChargeCostItemUpdate = Partial<Omit<ServiceChargeCostItem, 'serviceChargeCostItemId' | 'serviceChargeSettlementId' | 'propertyId' | 'createdAt' | 'updatedAt'>>;

// ----------------------------------------------------------------------------
// Renovation measures (Handwerker / Sanierungsmaßnahmen overview)
// ----------------------------------------------------------------------------

export interface RenovationMeasure {
  renovationMeasureId: number;
  propertyId: number;
  sortOrder: number;
  title: string;
  /** Drives the static Preisindikation lookup on the detail page (e.g.
   *  "Badezimmer") — free text, unknown/unset categories just show no
   *  estimate card. */
  category: string | null;
  /** Beschreibung & Schäden — free text. */
  description: string | null;
  /** Kosten veranschlagt — owner's own estimate. */
  estimatedCost: number | null;
  /** Kosten lt. Angebot — synced from whichever quote is accepted (see
   *  RenovationMeasureQuote); its presence is what drives the "Angebot"
   *  status checkmark (no separate boolean for it). */
  quotedCost: number | null;
  preferredStartDate: string | null;
  quotedStartDate: string | null;
  /** Abschluss ist — entered by the owner once the contractor reports the
   *  work done; there's no contractor portal to report it directly. */
  actualCompletionDate: string | null;
  /** Local status flag only — no external marketplace/platform integration. */
  published: boolean;
  publishedAt: string | null;
  /** Once true, the measure is read-only except the two completion
   *  confirmations below. Set either directly or by accepting a quote. */
  quoteAccepted: boolean;
  /** "Handwerker bestätigt" — owner-entered proxy for the contractor
   *  reporting completion; there's no contractor portal to report it
   *  directly. Gates customerConfirmedCompleted (owner confirms only after
   *  entering this). */
  craftsmanConfirmedCompleted: boolean;
  /** "Kunde bestätigt" — owner's own final confirmation. */
  customerConfirmedCompleted: boolean;
  /** Rückfragen des Handwerks — free-text notes, entered by the owner on
   *  the contractor's behalf (phone/email), not a real message thread. */
  craftsmanNotes: string | null;
  createdAt: string;
  updatedAt: string;
}

export type RenovationMeasureInsert = Omit<RenovationMeasure, 'renovationMeasureId' | 'publishedAt' | 'createdAt' | 'updatedAt'>;
export type RenovationMeasureUpdate = Partial<Omit<RenovationMeasure, 'renovationMeasureId' | 'propertyId' | 'createdAt' | 'updatedAt'>>;

/** One offer the owner received for a measure — manually entered, no
 *  craftsperson-facing portal. Accepting a quote sets it (and clears any
 *  other accepted quote on the same measure) and syncs the parent
 *  measure's quotedCost/quoteAccepted. */
export interface RenovationMeasureQuote {
  renovationMeasureQuoteId: number;
  renovationMeasureId: number;
  propertyId: number;
  sortOrder: number;
  companyName: string;
  cost: number | null;
  documentPath: string | null;
  documentFileName: string | null;
  accepted: boolean;
  createdAt: string;
  updatedAt: string;
}

export type RenovationMeasureQuoteInsert = Omit<RenovationMeasureQuote, 'renovationMeasureQuoteId' | 'createdAt' | 'updatedAt'>;

export interface RenovationMeasureDefect {
  renovationMeasureDefectId: number;
  renovationMeasureId: number;
  propertyId: number;
  sortOrder: number;
  description: string;
  createdAt: string;
}

export type RenovationMeasureDefectInsert = Omit<RenovationMeasureDefect, 'renovationMeasureDefectId' | 'createdAt'>;

/** A damage photo attached to a measure's Beschreibung & Schäden section. */
export interface RenovationMeasurePhoto {
  renovationMeasurePhotoId: number;
  renovationMeasureId: number;
  propertyId: number;
  storagePath: string;
  fileName: string;
  createdAt: string;
}

export type RenovationMeasurePhotoInsert = Omit<RenovationMeasurePhoto, 'renovationMeasurePhotoId' | 'createdAt'>;

// ----------------------------------------------------------------------------
// TaxExpenseCategory — Steuerunterlagen ("Angefallene Kosten")
// ----------------------------------------------------------------------------

/** One property-scoped expense category (Fahrtkosten, Übernachtungskosten,
 *  ...) with a manually-entered total and any number of uploaded receipts.
 *  Entwicklungsstufe 1 — manual entry only, no OCR extraction, no WISO
 *  export; elsterReference is a free-text field the user fills in
 *  themselves rather than a value this app looks up or validates. */
export interface TaxExpenseCategory {
  taxExpenseCategoryId: number;
  propertyId: number;
  sortOrder: number;
  label: string;
  amount: number;
  elsterReference: string | null;
  createdAt: string;
  updatedAt: string;
}

export type TaxExpenseCategoryInsert = Omit<TaxExpenseCategory, 'taxExpenseCategoryId' | 'createdAt' | 'updatedAt'>;
export type TaxExpenseCategoryUpdate = Partial<Omit<TaxExpenseCategory, 'taxExpenseCategoryId' | 'propertyId' | 'createdAt' | 'updatedAt'>>;

/** One uploaded receipt attached to a tax expense category. */
export interface TaxExpenseDocument {
  taxExpenseDocumentId: number;
  taxExpenseCategoryId: number;
  propertyId: number;
  storagePath: string;
  fileName: string;
  createdAt: string;
}

export type TaxExpenseDocumentInsert = Omit<TaxExpenseDocument, 'taxExpenseDocumentId' | 'createdAt'>;

// ----------------------------------------------------------------------------
// Financing
// ----------------------------------------------------------------------------

export interface Financing {
  financingId: number;
  propertyId: number;
  numberOfLoans: number;
  weightedLoanAmount: number | null;
  weightedEquity: number | null;
  weightedInterestRate: number | null;
  weightedRepaymentRate: number | null;
  weightedMonthlyDebtService: number | null;
  singleLoanAmount: number | null;
  singleEquity: number | null;
  singleInterestRate: number | null;
  singleRepaymentRate: number | null;
  singleMonthlyDebtService: number | null;
  singleRepaymentStartDate: string | null;
  fixedInterestPeriod: number | null;
  interestRate: number | null;
  regularInterestRate: number | null;
  createdAt: string;
  updatedAt: string;
}

export type FinancingInsert = Omit<Financing, 'financingId' | 'createdAt' | 'updatedAt'>;
export type FinancingUpdate = Partial<Omit<Financing, 'financingId' | 'propertyId' | 'createdAt' | 'updatedAt'>>;

export interface FinancingCalculation {
  financingCalculationId: number;
  financingId: number;
  month: number;
  monthlyDebtService: number | null;
  singleMonthlyDebtService: number | null;
  interestPortion: number | null;
  repaymentPortion: number | null;
  remainingDebt: number | null;
  repaymentYear: number | null;
  repaymentMonth: number | null;
  createdAt: string;
}

export type FinancingCalculationInsert = Omit<FinancingCalculation, 'financingCalculationId' | 'createdAt'>;

export interface InterestCalculation {
  interestCalculationId: number;
  financingId: number;
  modificationVariable: number | null;
  fixedInterestPeriod: number | null;
  fixedInterestPeriodPercent: number | null;
  estimatedInterestRate: number | null;
  loanToValueEquityShare: number | null;
  equityThresholds: number | null;
  equityThresholdsCorridor: number | null;
  equityThresholdsPercent: number | null;
  createdAt: string;
  updatedAt: string;
}

export type InterestCalculationInsert = Omit<InterestCalculation, 'interestCalculationId' | 'createdAt' | 'updatedAt'>;
export type InterestCalculationUpdate = Partial<Omit<InterestCalculation, 'interestCalculationId' | 'financingId' | 'createdAt' | 'updatedAt'>>;

// ----------------------------------------------------------------------------
// RentIndex / BuildingProportion / Depreciation / MetricsToday
// ----------------------------------------------------------------------------

export interface RentIndex {
  rentIndexId: number;
  cityId: number;
  validFrom: string;
  validUntil: string | null;
  methodology: 'QUALIFIED' | 'SIMPLE' | 'EMPIRICAL';
  referenceRents: number;
  createdAt: string;
  updatedAt: string;
}

export type RentIndexInsert = Omit<RentIndex, 'rentIndexId' | 'createdAt' | 'updatedAt'>;
export type RentIndexUpdate = Partial<Omit<RentIndex, 'rentIndexId' | 'cityId' | 'createdAt' | 'updatedAt'>>;

export type KpfConstructionYearBucket =
  | '<1918'
  | '1918-1949'
  | '1950-1959'
  | '1960-1969'
  | '1970-1979'
  | '1980-1989'
  | '1990-1999'
  | '2000-2009'
  | '2010-2014'
  | '2015+';

export interface KpfRange {
  postalCode:              string;
  condition:               PropertyCondition;
  constructionYearBucket:  KpfConstructionYearBucket;
  minValue:                number;
  maxValue:                number;
  sampleSize:              number;
}

export type KpfRangeInsert = KpfRange;
export type KpfRangeFilters = Partial<Pick<KpfRange, 'postalCode' | 'condition' | 'constructionYearBucket'>>;

export interface BuildingProportion {
  buildingProportionId: number;
  propertyId: number;
  acquisitionCostsId: number | null;
  totalArea: number | null;
  totalAreaShare: number | null;
  landValue: number | null;
  landAndSoil: number | null;
  buildingFactor: number | null;
  buildingValue: number | null;
  numerator: number | null;
  denominator: number | null;
  ancillaryCostShare: number | null;
  buildingDepreciation: number | null;
  createdAt: string;
  updatedAt: string;
}

export type BuildingProportionInsert = Omit<BuildingProportion, 'buildingProportionId' | 'createdAt' | 'updatedAt'>;
export type BuildingProportionUpdate = Partial<Omit<BuildingProportion, 'buildingProportionId' | 'propertyId' | 'createdAt' | 'updatedAt'>>;

export interface Depreciation {
  depreciationId: number;
  propertyId: number;
  configId: number | null;
  depreciationType: string | null;
  depreciationCalculation: number | null;
  depreciationYear: number | null;
  residentialType: 'RESIDENTIAL' | 'COMMERCIAL' | 'MIXED' | null;
  roofRenewal: number | null;
  windowsExteriorDoors: number | null;
  pipingSystems: number | null;
  heatingSystem: number | null;
  exteriorWallInsulation: number | null;
  bathrooms: number | null;
  interiorFitting: number | null;
  floorplanImprovement: number | null;
  modernisationPoints: number | null;
  age: number | null;
  totalUsefulLife: number | null;
  remainingUsefulLifeYears: number | null;
  depreciationRatePercent: number | null;
  createdAt: string;
  updatedAt: string;
}

export type DepreciationInsert = Omit<Depreciation, 'depreciationId' | 'createdAt' | 'updatedAt'>;
export type DepreciationUpdate = Partial<Omit<Depreciation, 'depreciationId' | 'propertyId' | 'createdAt' | 'updatedAt'>>;

export interface MetricsToday {
  userId: string;
  propertyId: number;
  tenancyId: number | null;
  coldRent: number | null;
  warmRent: number | null;
  isRented: boolean | null;
  maintenanceCostsId: number | null;
  maintenanceTotalCosts: number | null;
  allocableCosts: number | null;
  nonAllocableCosts: number | null;
  financingId: number | null;
  monthlyDebtService: number | null;
  interestRate: number | null;
  depreciationId: number | null;
  depreciationRatePercent: number | null;
  remainingUsefulLifeYears: number | null;
  developmentId: number | null;
}

// ----------------------------------------------------------------------------
// DevelopmentTomorrow / Renovation / LegalRequirements / SystemConfig / Notification
// ----------------------------------------------------------------------------

export interface DevelopmentTomorrow {
  developmentTomorrowId: number;
  propertyId: number;
  tenancyId: number | null;
  cityId: number | null;
  legalRequirementsId: number | null;
  rentIndexId: number | null;
  financingId: number | null;
  developmentYear: number | null;
  yearStart: number | null;
  dateStart: number | null;
  metropolitanArea: boolean | null;
  coldRentIncrease: number | null;
  coldRentIncreaseEligible: boolean | null;
  coldRentIncreaseLockPeriod: number | null;
  coldRentIncreaseReminder: boolean | null;
  coldRentIncreasePercent: number | null;
  coldRentIncrease3YearAveragePercent: number | null;
  lastRentIncrease: number | null;
  lastRentIncreaseRelevance: boolean | null;
  lastRentIncreaseValue: number | null;
  lastRentIncreasePercent: number | null;
  createdAt: string;
  updatedAt: string;
}

export type DevelopmentTomorrowInsert = Omit<DevelopmentTomorrow, 'developmentTomorrowId' | 'createdAt' | 'updatedAt'>;
export type DevelopmentTomorrowUpdate = Partial<Omit<DevelopmentTomorrow, 'developmentTomorrowId' | 'propertyId' | 'createdAt' | 'updatedAt'>>;

export interface DevelopmentTomorrowMetrics {
  metricsId: number;
  developmentTomorrowId: number;
  sqmPriceWithRi: number | null;
  sqmPriceWithoutRi: number | null;
  totalRentWithRi: number | null;
  totalRentWithoutRi: number | null;
  debtServiceDiffWithRi: number | null;
  debtServiceDiffWithoutRi: number | null;
  netRentYieldPreTaxWithRi: number | null;
  netRentYieldPreTaxWithoutRi: number | null;
  netRentYieldAfterTaxWithRi: number | null;
  netRentYieldAfterTaxWithoutRi: number | null;
  operativeCashflowWithRi: number | null;
  operativeCashflowWithoutRi: number | null;
  afterTaxCashflowWithRi: number | null;
  afterTaxCashflowWithoutRi: number | null;
  computedAt: string;
}

export type DevelopmentTomorrowMetricsInsert = Omit<DevelopmentTomorrowMetrics, 'metricsId'>;

export interface Renovation {
  renovationId: number;
  propertyId: number;
  legalRequirementsId: number | null;
  modernisationProperty: string | null;
  modernisationDate: string | null;
  modernisationValue: number | null;
  limit15Percent: number | null;
  threeYearValue: number | null;
  lastModernisation: string | null;
  lastModernisationRelevance: string | null;
  lastModernisationValue: number | null;
  lastModernisationPercent: number | null;
  purchaseDepreciation: number | null;
  createdAt: string;
  updatedAt: string;
}

export type RenovationInsert = Omit<Renovation, 'renovationId' | 'createdAt' | 'updatedAt'>;
export type RenovationUpdate = Partial<Omit<Renovation, 'renovationId' | 'propertyId' | 'createdAt' | 'updatedAt'>>;

export interface LegalRequirements {
  legalRequirementsId: number;
  cityId: number;
  rentCapLimit: number | null;
  sqmIncreaseLow: number | null;
  sqmIncreaseHigh: number | null;
  renovationLimitPercent: number | null;
  validFrom: string;
  validUntil: string | null;
  createdAt: string;
  updatedAt: string;
}

export type LegalRequirementsInsert = Omit<LegalRequirements, 'legalRequirementsId' | 'createdAt' | 'updatedAt'>;
export type LegalRequirementsUpdate = Partial<Omit<LegalRequirements, 'legalRequirementsId' | 'cityId' | 'createdAt' | 'updatedAt'>>;

export interface SystemConfig {
  configId: number;
  configKey: string;
  configValue: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
}

export type SystemConfigUpdate = Partial<Pick<SystemConfig, 'configValue' | 'description'>>;

export interface Notification {
  notificationId: number;
  userId: string;
  propertyId: number | null;
  type: 'INFO' | 'WARNING' | 'ACTION';
  message: string;
  tradesperson: string | null;
  financialBroker: string | null;
  readAt: string | null;
  createdAt: string;
}

export type NotificationInsert = Omit<Notification, 'notificationId' | 'createdAt'>;

// ----------------------------------------------------------------------------
// Document (global "Dokumente" page — distinct from tenancy_document)
// ----------------------------------------------------------------------------

export type DocumentCategory = 'Persönlich' | 'Bestandsobjekt' | 'Detailbewertung';

export interface UserDocument {
  documentId: number;
  userId: string;
  category: DocumentCategory;
  name: string;
  /** Set when category is "Bestandsobjekt". */
  propertyId: number | null;
  /** Set when category is "Detailbewertung". */
  quickCheckId: number | null;
  /** Drives the KI-Hinweis "vermutlich zu alt" heuristic. */
  documentDate: string | null;
  fileName: string;
  storagePath: string;
  contentType: string | null;
  fileSize: number | null;
  createdAt: string;
  updatedAt: string;
}

export type UserDocumentInsert = Omit<UserDocument, 'documentId' | 'fileName' | 'storagePath' | 'contentType' | 'fileSize' | 'createdAt' | 'updatedAt'>;

// ----------------------------------------------------------------------------
// API Response types
// ----------------------------------------------------------------------------

export interface ApiResponse<T> {
  data?: T;
  error?: {
    message: string;
    code?: string;
  };
  success: boolean;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
}
