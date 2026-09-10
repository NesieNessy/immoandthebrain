import { describe, expect, it } from 'vitest';
import { EnergyEfficient, type ParkingSpace, type Property, type PropertySaleListing, type Tenancy } from '@immoandthebrain/types';
import { EMPTY_FORM, formFromListing, formToListingFields, initialFormFromProperty } from './saleListingForm';

const baseProperty: Property = {
    propertyId: 1,
    userId: 'user-1',
    cityId: null,
    propertyAbbreviation: null,
    street: 'Musterstraße',
    houseNumber: '123',
    yearOfConstruction: 1995,
    energyEfficient: EnergyEfficient.B,
    imageUrl: null,
    city: 'München',
    postalCode: '80801',
    federalState: 'Bayern',
    squareMeters: 72,
    numberOfRooms: 3,
    propertyCategory: 'EIGENTUMSWOHNUNG',
    numberOfUnits: 1,
    archivedAt: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
};

const baseTenancy: Tenancy = {
    tenancyId: 1,
    maintenanceCostsId: null,
    parkingSpaceId: null,
    propertyId: 1,
    propertyUnitId: 1,
    isRented: true,
    tenancyStartDate: '2024-01-01',
    tenancyEndDate: null,
    tenancyType: null,
    tenancyUnits: null,
    tenancyUnitsPrice: null,
    parkingSpaceRent: null,
    miscRent: 250,
    warmRent: 1450,
    coldRent: 1200,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    tenantFirstName: 'Klaus',
    tenantLastName: 'Fischer',
    deposit: 2400,
    nextRentAdjustmentDate: null,
    nextRentAdjustmentAmount: null,
    renovationAdjustmentPlanned: null,
    renovationAdjustmentStartDate: null,
    renovationAdjustmentEndDate: null,
    renovationAdjustmentAmount: null,
    rentAdjustmentReminderDate: null,
    renovationAdjustmentReminderDate: null,
    petsAllowed: null,
    redecorationClause: null,
    subletAllowed: null,
    additionalTerms: null,
    acceptanceProtocol: false,
    depositPaidOut: false,
};

const baseParkingSpace: ParkingSpace = {
    parkingSpaceId: 1,
    propertyId: 1,
    parkingSpaceType: 'GARAGE',
    numberOfParkingSpaces: 1,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
};

const baseListing: PropertySaleListing = {
    propertySaleListingId: 1,
    propertyId: 1,
    street: 'Musterstraße 123',
    houseNumber: null,
    postalCode: '80801',
    city: 'München',
    squareMeters: 72,
    condition: 'Standard',
    yearOfConstruction: 1995,
    energyEfficient: EnergyEfficient.B,
    floor: 2,
    numberOfRooms: 3,
    heatingType: 'Gasheizung',
    isRented: true,
    coldRent: 1200,
    serviceCharges: 250,
    parkingSpaceCount: 1,
    parkingSpaceType: 'Garage',
    salePrice: 450000,
    parkingSpaceSalePrice: 20000,
    availableFrom: '2026-06-01',
    brokerCommissionPercent: 3.57,
    description: 'Tolle Mikrolage.',
    status: 'draft',
    publishedAt: null,
    selectedPortals: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
};

describe('initialFormFromProperty', () => {
    it('carries over the known property fields, leaving sale-only fields blank', () => {
        const form = initialFormFromProperty(baseProperty, [], []);
        expect(form.streetHouseNumber).toBe('Musterstraße 123');
        expect(form.postalCode).toBe('80801');
        expect(form.city).toBe('München');
        expect(form.squareMeters).toBe('72');
        expect(form.yearOfConstruction).toBe('1995');
        expect(form.energyEfficient).toBe('B');
        expect(form.numberOfRooms).toBe('3');

        expect(form.condition).toBe('');
        expect(form.heatingType).toBe('');
        expect(form.salePrice).toBe('');
        expect(form.parkingSpaceSalePrice).toBe('');
        expect(form.availableFrom).toBe('');
        expect(form.brokerCommissionPercent).toBe('');
        expect(form.description).toBe('');
    });

    it('carries over rent/service-charge figures from the first rented tenancy', () => {
        const form = initialFormFromProperty(baseProperty, [baseTenancy], []);
        expect(form.isRented).toBe(true);
        expect(form.coldRent).toBe('1200');
        expect(form.serviceCharges).toBe('250');
    });

    it('ignores a tenancy that is not currently rented', () => {
        const vacated = { ...baseTenancy, isRented: false };
        const form = initialFormFromProperty(baseProperty, [vacated], []);
        expect(form.isRented).toBe(false);
        expect(form.coldRent).toBe('');
        expect(form.serviceCharges).toBe('');
    });

    it('picks the first rented tenancy when several are given', () => {
        const vacated = { ...baseTenancy, tenancyId: 2, isRented: false, coldRent: 999 };
        const form = initialFormFromProperty(baseProperty, [vacated, baseTenancy], []);
        expect(form.coldRent).toBe('1200');
    });

    it('carries over the parking space count when one exists', () => {
        const form = initialFormFromProperty(baseProperty, [], [baseParkingSpace]);
        expect(form.parkingSpaceCount).toBe('1');
        // The sale-listing parking *type* is a separate, sale-only vocabulary
        // (Garage/Duplex-Stellplatz/…) that doesn't map from ParkingSpaceType —
        // it always starts blank for the owner to choose.
        expect(form.parkingSpaceType).toBe('');
    });

    it('leaves numberOfRooms and parkingSpaceCount blank when absent', () => {
        const noRooms = { ...baseProperty, numberOfRooms: null };
        const form = initialFormFromProperty(noRooms, [], []);
        expect(form.numberOfRooms).toBe('');
        expect(form.parkingSpaceCount).toBe('');
    });

    it('falls back to an empty houseNumber without a stray trailing space', () => {
        const noHouseNumber = { ...baseProperty, houseNumber: '' };
        const form = initialFormFromProperty(noHouseNumber, [], []);
        expect(form.streetHouseNumber).toBe('Musterstraße');
    });
});

describe('formFromListing', () => {
    it('reloads every field from a previously saved listing', () => {
        const form = formFromListing(baseListing);
        expect(form.streetHouseNumber).toBe('Musterstraße 123');
        expect(form.condition).toBe('Standard');
        expect(form.heatingType).toBe('Gasheizung');
        expect(form.isRented).toBe(true);
        expect(form.coldRent).toBe('1200');
        expect(form.serviceCharges).toBe('250');
        expect(form.parkingSpaceCount).toBe('1');
        expect(form.parkingSpaceType).toBe('Garage');
        expect(form.salePrice).toBe('450000');
        expect(form.parkingSpaceSalePrice).toBe('20000');
        expect(form.availableFrom).toBe('2026-06-01');
        expect(form.brokerCommissionPercent).toBe('3.57');
        expect(form.description).toBe('Tolle Mikrolage.');
    });

    it('maps null numeric/enum fields to empty strings, not "null"', () => {
        const blank: PropertySaleListing = {
            ...baseListing,
            condition: null,
            heatingType: null,
            floor: null,
            numberOfRooms: null,
            coldRent: null,
            serviceCharges: null,
            parkingSpaceCount: null,
            parkingSpaceType: null,
            salePrice: null,
            parkingSpaceSalePrice: null,
            availableFrom: null,
            brokerCommissionPercent: null,
            description: null,
        };
        const form = formFromListing(blank);
        expect(form.condition).toBe('');
        expect(form.heatingType).toBe('');
        expect(form.floor).toBe('');
        expect(form.numberOfRooms).toBe('');
        expect(form.coldRent).toBe('');
        expect(form.serviceCharges).toBe('');
        expect(form.parkingSpaceCount).toBe('');
        expect(form.parkingSpaceType).toBe('');
        expect(form.salePrice).toBe('');
        expect(form.parkingSpaceSalePrice).toBe('');
        expect(form.availableFrom).toBe('');
        expect(form.brokerCommissionPercent).toBe('');
        expect(form.description).toBe('');
    });

    it('preserves a zero value instead of treating it as blank', () => {
        const zeroPrice = { ...baseListing, parkingSpaceSalePrice: 0, brokerCommissionPercent: 0 };
        const form = formFromListing(zeroPrice);
        expect(form.parkingSpaceSalePrice).toBe('0');
        expect(form.brokerCommissionPercent).toBe('0');
    });

    it('combines street and houseNumber back into one field', () => {
        const separate = { ...baseListing, street: 'Beispielweg', houseNumber: '42' };
        const form = formFromListing(separate);
        expect(form.streetHouseNumber).toBe('Beispielweg 42');
    });
});

describe('formToListingFields', () => {
    it('parses filled-in string fields back to their numeric/date types', () => {
        const form = formFromListing(baseListing);
        const fields = formToListingFields(form, 'draft', null, []);
        expect(fields.street).toBe('Musterstraße 123');
        expect(fields.houseNumber).toBeNull();
        expect(fields.squareMeters).toBe(72);
        expect(fields.salePrice).toBe(450000);
        expect(fields.parkingSpaceSalePrice).toBe(20000);
        expect(fields.brokerCommissionPercent).toBe(3.57);
        expect(fields.availableFrom).toBe('2026-06-01');
        expect(fields.condition).toBe('Standard');
        expect(fields.isRented).toBe(true);
    });

    it('maps every blank string field to null, not NaN or ""', () => {
        const fields = formToListingFields(EMPTY_FORM, 'draft', null, []);
        expect(fields.street).toBeNull();
        expect(fields.squareMeters).toBeNull();
        expect(fields.yearOfConstruction).toBeNull();
        expect(fields.floor).toBeNull();
        expect(fields.numberOfRooms).toBeNull();
        expect(fields.coldRent).toBeNull();
        expect(fields.serviceCharges).toBeNull();
        expect(fields.parkingSpaceCount).toBeNull();
        expect(fields.salePrice).toBeNull();
        expect(fields.parkingSpaceSalePrice).toBeNull();
        expect(fields.brokerCommissionPercent).toBeNull();
        expect(fields.availableFrom).toBeNull();
        expect(fields.description).toBeNull();
        expect(fields.condition).toBeNull();
        expect(fields.heatingType).toBeNull();
        expect(fields.parkingSpaceType).toBeNull();
        expect(fields.energyEfficient).toBeNull();
    });

    it('treats a "0" string field as the number 0, not null', () => {
        const form = { ...EMPTY_FORM, parkingSpaceSalePrice: '0', brokerCommissionPercent: '0' };
        const fields = formToListingFields(form, 'draft', null, []);
        expect(fields.parkingSpaceSalePrice).toBe(0);
        expect(fields.brokerCommissionPercent).toBe(0);
    });

    it('passes status, publishedAt, and selectedPortals through as given', () => {
        const form = formFromListing(baseListing);
        const publishedAt = '2026-03-01T12:00:00.000Z';
        const fields = formToListingFields(form, 'published', publishedAt, ['immobilienscout24', 'immowelt']);
        expect(fields.status).toBe('published');
        expect(fields.publishedAt).toBe(publishedAt);
        expect(fields.selectedPortals).toEqual(['immobilienscout24', 'immowelt']);
    });

    it('is the exact inverse of formFromListing for a fully filled-in listing', () => {
        const form = formFromListing(baseListing);
        const fields = formToListingFields(form, baseListing.status, baseListing.publishedAt, baseListing.selectedPortals);
        expect(fields).toEqual({
            street: baseListing.street,
            houseNumber: null,
            postalCode: baseListing.postalCode,
            city: baseListing.city,
            squareMeters: baseListing.squareMeters,
            yearOfConstruction: baseListing.yearOfConstruction,
            energyEfficient: baseListing.energyEfficient,
            floor: baseListing.floor,
            numberOfRooms: baseListing.numberOfRooms,
            condition: baseListing.condition,
            heatingType: baseListing.heatingType,
            isRented: baseListing.isRented,
            coldRent: baseListing.coldRent,
            serviceCharges: baseListing.serviceCharges,
            parkingSpaceCount: baseListing.parkingSpaceCount,
            parkingSpaceType: baseListing.parkingSpaceType,
            salePrice: baseListing.salePrice,
            parkingSpaceSalePrice: baseListing.parkingSpaceSalePrice,
            availableFrom: baseListing.availableFrom,
            brokerCommissionPercent: baseListing.brokerCommissionPercent,
            description: baseListing.description,
            status: baseListing.status,
            publishedAt: baseListing.publishedAt,
            selectedPortals: baseListing.selectedPortals,
        });
    });
});
