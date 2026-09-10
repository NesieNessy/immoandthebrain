import type {
    EnergyEfficient,
    ParkingSpace,
    Property,
    PropertySaleListing,
    PropertySaleListingUpdate,
    SaleListingCondition,
    SaleListingHeatingType,
    SaleListingParkingType,
    Tenancy,
} from '@immoandthebrain/types';

export interface SaleListingForm {
    streetHouseNumber: string;
    postalCode: string;
    city: string;
    squareMeters: string;
    condition: SaleListingCondition | '';
    yearOfConstruction: string;
    energyEfficient: EnergyEfficient | '';
    floor: string;
    numberOfRooms: string;
    heatingType: SaleListingHeatingType | '';
    isRented: boolean;
    coldRent: string;
    serviceCharges: string;
    parkingSpaceCount: string;
    parkingSpaceType: SaleListingParkingType | '';
    salePrice: string;
    parkingSpaceSalePrice: string;
    availableFrom: string;
    brokerCommissionPercent: string;
    description: string;
}

export const EMPTY_FORM: SaleListingForm = {
    streetHouseNumber: '', postalCode: '', city: '', squareMeters: '',
    condition: '', yearOfConstruction: '', energyEfficient: '', floor: '', numberOfRooms: '',
    heatingType: '', isRented: false, coldRent: '', serviceCharges: '',
    parkingSpaceCount: '', parkingSpaceType: '', salePrice: '', parkingSpaceSalePrice: '',
    availableFrom: '', brokerCommissionPercent: '', description: '',
};

/** Reloads a previously saved listing exactly as it was left — no carry-over
 *  involved, since the owner's own edits already won. */
export function formFromListing(listing: PropertySaleListing): SaleListingForm {
    return {
        streetHouseNumber: [listing.street, listing.houseNumber].filter(Boolean).join(' '),
        postalCode: listing.postalCode ?? '',
        city: listing.city ?? '',
        squareMeters: listing.squareMeters != null ? String(listing.squareMeters) : '',
        condition: listing.condition ?? '',
        yearOfConstruction: listing.yearOfConstruction != null ? String(listing.yearOfConstruction) : '',
        energyEfficient: listing.energyEfficient ?? '',
        floor: listing.floor != null ? String(listing.floor) : '',
        numberOfRooms: listing.numberOfRooms != null ? String(listing.numberOfRooms) : '',
        heatingType: listing.heatingType ?? '',
        isRented: listing.isRented ?? false,
        coldRent: listing.coldRent != null ? String(listing.coldRent) : '',
        serviceCharges: listing.serviceCharges != null ? String(listing.serviceCharges) : '',
        parkingSpaceCount: listing.parkingSpaceCount != null ? String(listing.parkingSpaceCount) : '',
        parkingSpaceType: listing.parkingSpaceType ?? '',
        salePrice: listing.salePrice != null ? String(listing.salePrice) : '',
        parkingSpaceSalePrice: listing.parkingSpaceSalePrice != null ? String(listing.parkingSpaceSalePrice) : '',
        availableFrom: listing.availableFrom ?? '',
        brokerCommissionPercent: listing.brokerCommissionPercent != null ? String(listing.brokerCommissionPercent) : '',
        description: listing.description ?? '',
    };
}

/**
 * First-open carry-over: everything already known about the property is
 * pre-filled (address, size, year, energy rating, room count, and — from
 * the first *rented* tenancy found, if any — the rent/service-charge
 * figures and rented status); sale-only fields (condition, heating type,
 * asking prices, availability, commission, description) stay blank for the
 * owner to fill in themselves.
 */
export function initialFormFromProperty(property: Property, tenancies: Tenancy[], parkingSpaces: ParkingSpace[]): SaleListingForm {
    const activeTenancy = tenancies.find((t) => t.isRented) ?? null;
    const parkingSpace = parkingSpaces[0] ?? null;
    return {
        ...EMPTY_FORM,
        streetHouseNumber: [property.street, property.houseNumber].filter(Boolean).join(' '),
        postalCode: property.postalCode,
        city: property.city,
        squareMeters: String(property.squareMeters),
        yearOfConstruction: String(property.yearOfConstruction),
        energyEfficient: property.energyEfficient ?? '',
        numberOfRooms: property.numberOfRooms != null ? String(property.numberOfRooms) : '',
        isRented: activeTenancy?.isRented ?? false,
        coldRent: activeTenancy?.coldRent != null ? String(activeTenancy.coldRent) : '',
        serviceCharges: activeTenancy?.miscRent != null ? String(activeTenancy.miscRent) : '',
        parkingSpaceCount: parkingSpace?.numberOfParkingSpaces != null ? String(parkingSpace.numberOfParkingSpaces) : '',
    };
}

/** Form → API payload. The combined "Straße & Hausnummer" field is stored
 *  in `street` alone (`houseNumber` stays null), matching the convention
 *  already used for `Property` elsewhere in the app. Empty strings become
 *  `null`, not empty strings, so an unfilled field reads back as unset. */
export function formToListingFields(
    form: SaleListingForm,
    status: PropertySaleListing['status'],
    publishedAt: string | null,
    selectedPortals: string[],
): PropertySaleListingUpdate {
    return {
        street: form.streetHouseNumber || null,
        houseNumber: null,
        postalCode: form.postalCode || null,
        city: form.city || null,
        squareMeters: form.squareMeters !== '' ? Number(form.squareMeters) : null,
        yearOfConstruction: form.yearOfConstruction !== '' ? Number(form.yearOfConstruction) : null,
        energyEfficient: form.energyEfficient || null,
        floor: form.floor !== '' ? Number(form.floor) : null,
        numberOfRooms: form.numberOfRooms !== '' ? Number(form.numberOfRooms) : null,
        condition: form.condition || null,
        heatingType: form.heatingType || null,
        isRented: form.isRented,
        coldRent: form.coldRent !== '' ? Number(form.coldRent) : null,
        serviceCharges: form.serviceCharges !== '' ? Number(form.serviceCharges) : null,
        parkingSpaceCount: form.parkingSpaceCount !== '' ? Number(form.parkingSpaceCount) : null,
        parkingSpaceType: form.parkingSpaceType || null,
        salePrice: form.salePrice !== '' ? Number(form.salePrice) : null,
        parkingSpaceSalePrice: form.parkingSpaceSalePrice !== '' ? Number(form.parkingSpaceSalePrice) : null,
        availableFrom: form.availableFrom || null,
        brokerCommissionPercent: form.brokerCommissionPercent !== '' ? Number(form.brokerCommissionPercent) : null,
        description: form.description || null,
        status,
        publishedAt,
        selectedPortals,
    };
}
