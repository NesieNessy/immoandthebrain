import { jsonRequest, propertyResourceRequest } from '@/lib/api/propertyResources';
import type {
    RentalTermsPetsAllowed,
    RentalTermsRedecorationClause,
    RentalTermsSubletAllowed,
    Tenancy,
    TenancyInsert,
    TenancyTypeValues,
    TenancyUpdate,
} from '@immoandthebrain/types';

function toTenancy(row: Record<string, unknown>): Tenancy {
    return {
        tenancyId: row.tenancy_id as number,
        maintenanceCostsId: row.maintenance_costs_id as number | null,
        parkingSpaceId: row.parking_space_id as number | null,
        propertyId: row.property_id as number,
        propertyUnitId: row.property_unit_id as number | null,
        isRented: row.is_rented as boolean | null,
        tenancyStartDate: row.tenancy_start_date as string | null,
        tenancyEndDate: row.tenancy_end_date as string | null,
        tenancyType: row.tenancy_type as TenancyTypeValues | null,
        tenancyUnits: row.tenancy_units as number | null,
        tenancyUnitsPrice: row.tenancy_units_price as number | null,
        parkingSpaceRent: row.parking_space_rent as number | null,
        miscRent: row.misc_rent as number | null,
        warmRent: row.warm_rent as number | null,
        coldRent: row.cold_rent as number | null,
        createdAt: row.created_at as string,
        updatedAt: row.updated_at as string,
        tenantFirstName: row.tenant_first_name as string,
        tenantLastName: row.tenant_last_name as string,
        deposit: row.deposit as number,
        nextRentAdjustmentDate: row.next_rent_adjustment_date as string | null,
        nextRentAdjustmentAmount: row.next_rent_adjustment_amount as number | null,
        renovationAdjustmentPlanned: row.renovation_adjustment_planned as boolean | null,
        renovationAdjustmentStartDate: row.renovation_adjustment_start_date as string | null,
        renovationAdjustmentEndDate: row.renovation_adjustment_end_date as string | null,
        renovationAdjustmentAmount: row.renovation_adjustment_amount as number | null,
        rentAdjustmentReminderDate: row.rent_adjustment_reminder_date as string | null,
        renovationAdjustmentReminderDate: row.renovation_adjustment_reminder_date as string | null,
        petsAllowed: row.pets_allowed as RentalTermsPetsAllowed | null,
        redecorationClause: row.redecoration_clause as RentalTermsRedecorationClause | null,
        subletAllowed: row.sublet_allowed as RentalTermsSubletAllowed | null,
        additionalTerms: row.additional_terms as string | null,
        acceptanceProtocol: row.acceptance_protocol as boolean,
        depositPaidOut: row.deposit_paid_out as boolean,
    };
}

// ----------------------------------------------------------------------------
// Queries
// ----------------------------------------------------------------------------

export async function getTenanciesByProperty(propertyId: number): Promise<Tenancy[]> {
    const data = await propertyResourceRequest<Record<string, unknown>[]>('tenancies', {}, { propertyId });
    return data?.map(toTenancy) ?? [];
}

export async function getTenancyById(tenancyId: number): Promise<Tenancy | null> {
    const data = await propertyResourceRequest<Record<string, unknown>>('tenancies', {}, { id: tenancyId });
    if (!data) return null;
    return toTenancy(data);
}

/** The current (or most recent) tenancy for a unit — null means the
 *  unit has never had one, i.e. it's vacant (Leerstand). */
export async function getCurrentTenancyByUnit(propertyUnitId: number): Promise<Tenancy | null> {
    const data = await propertyResourceRequest<Record<string, unknown>>('tenancies', {}, { propertyUnitId, current: true, single: true });
    if (!data) return null;
    return toTenancy(data);
}

/** Every tenancy (current + past) ever recorded for a unit — used by
 *  the tenancy history table, which shows all but the current one. */
export async function getTenanciesByUnit(propertyUnitId: number): Promise<Tenancy[]> {
    const data = await propertyResourceRequest<Record<string, unknown>[]>('tenancies', {}, { propertyUnitId });
    return data?.map(toTenancy) ?? [];
}

// ----------------------------------------------------------------------------
// Mutations
// ----------------------------------------------------------------------------

export async function createTenancy(payload: TenancyInsert): Promise<Tenancy | null> {
    const data = await propertyResourceRequest<Record<string, unknown>>('tenancies', jsonRequest('POST', { values: {
            maintenance_costs_id: payload.maintenanceCostsId,
            parking_space_id: payload.parkingSpaceId,
            property_id: payload.propertyId,
            property_unit_id: payload.propertyUnitId,
            is_rented: payload.isRented,
            tenancy_start_date: payload.tenancyStartDate,
            tenancy_end_date: payload.tenancyEndDate,
            tenancy_type: payload.tenancyType,
            tenancy_units: payload.tenancyUnits,
            tenancy_units_price: payload.tenancyUnitsPrice,
            parking_space_rent: payload.parkingSpaceRent,
            misc_rent: payload.miscRent,
            warm_rent: payload.warmRent,
            cold_rent: payload.coldRent,
            tenant_first_name: payload.tenantFirstName,
            tenant_last_name: payload.tenantLastName,
            deposit: payload.deposit,
            next_rent_adjustment_date: payload.nextRentAdjustmentDate,
            next_rent_adjustment_amount: payload.nextRentAdjustmentAmount,
            renovation_adjustment_planned: payload.renovationAdjustmentPlanned,
            renovation_adjustment_start_date: payload.renovationAdjustmentStartDate,
            renovation_adjustment_end_date: payload.renovationAdjustmentEndDate,
            renovation_adjustment_amount: payload.renovationAdjustmentAmount,
            rent_adjustment_reminder_date: payload.rentAdjustmentReminderDate,
            renovation_adjustment_reminder_date: payload.renovationAdjustmentReminderDate,
        } }));
    if (!data) return null;
    return toTenancy(data);
}

export async function updateTenancy(
    tenancyId: number,
    updates: TenancyUpdate,
): Promise<Tenancy | null> {
    const dbUpdates: Record<string, unknown> = {};

    if (updates.maintenanceCostsId !== undefined) dbUpdates.maintenance_costs_id = updates.maintenanceCostsId;
    if (updates.parkingSpaceId !== undefined) dbUpdates.parking_space_id = updates.parkingSpaceId;
    if (updates.propertyUnitId !== undefined) dbUpdates.property_unit_id = updates.propertyUnitId;
    if (updates.isRented !== undefined) dbUpdates.is_rented = updates.isRented;
    if (updates.tenancyStartDate !== undefined) dbUpdates.tenancy_start_date = updates.tenancyStartDate;
    if (updates.tenancyEndDate !== undefined) dbUpdates.tenancy_end_date = updates.tenancyEndDate;
    if (updates.tenancyType !== undefined) dbUpdates.tenancy_type = updates.tenancyType;
    if (updates.tenancyUnits !== undefined) dbUpdates.tenancy_units = updates.tenancyUnits;
    if (updates.tenancyUnitsPrice !== undefined) dbUpdates.tenancy_units_price = updates.tenancyUnitsPrice;
    if (updates.parkingSpaceRent !== undefined) dbUpdates.parking_space_rent = updates.parkingSpaceRent;
    if (updates.miscRent !== undefined) dbUpdates.misc_rent = updates.miscRent;
    if (updates.warmRent !== undefined) dbUpdates.warm_rent = updates.warmRent;
    if (updates.coldRent !== undefined) dbUpdates.cold_rent = updates.coldRent;
    if (updates.tenantFirstName !== undefined) dbUpdates.tenant_first_name = updates.tenantFirstName;
    if (updates.tenantLastName !== undefined) dbUpdates.tenant_last_name = updates.tenantLastName;
    if (updates.deposit !== undefined) dbUpdates.deposit = updates.deposit;
    if (updates.nextRentAdjustmentDate !== undefined) dbUpdates.next_rent_adjustment_date = updates.nextRentAdjustmentDate;
    if (updates.nextRentAdjustmentAmount !== undefined) dbUpdates.next_rent_adjustment_amount = updates.nextRentAdjustmentAmount;
    if (updates.renovationAdjustmentPlanned !== undefined) dbUpdates.renovation_adjustment_planned = updates.renovationAdjustmentPlanned;
    if (updates.renovationAdjustmentStartDate !== undefined) dbUpdates.renovation_adjustment_start_date = updates.renovationAdjustmentStartDate;
    if (updates.renovationAdjustmentEndDate !== undefined) dbUpdates.renovation_adjustment_end_date = updates.renovationAdjustmentEndDate;
    if (updates.renovationAdjustmentAmount !== undefined) dbUpdates.renovation_adjustment_amount = updates.renovationAdjustmentAmount;
    if (updates.rentAdjustmentReminderDate !== undefined) dbUpdates.rent_adjustment_reminder_date = updates.rentAdjustmentReminderDate;
    if (updates.renovationAdjustmentReminderDate !== undefined) dbUpdates.renovation_adjustment_reminder_date = updates.renovationAdjustmentReminderDate;
    if (updates.petsAllowed !== undefined) dbUpdates.pets_allowed = updates.petsAllowed;
    if (updates.redecorationClause !== undefined) dbUpdates.redecoration_clause = updates.redecorationClause;
    if (updates.subletAllowed !== undefined) dbUpdates.sublet_allowed = updates.subletAllowed;
    if (updates.additionalTerms !== undefined) dbUpdates.additional_terms = updates.additionalTerms;
    if (updates.acceptanceProtocol !== undefined) dbUpdates.acceptance_protocol = updates.acceptanceProtocol;
    if (updates.depositPaidOut !== undefined) dbUpdates.deposit_paid_out = updates.depositPaidOut;

    const data = await propertyResourceRequest<Record<string, unknown>>('tenancies', jsonRequest('PATCH', { id: tenancyId, values: dbUpdates }));
    if (!data) return null;
    return toTenancy(data);
}

export async function deleteTenancy(tenancyId: number): Promise<boolean> {
    return Boolean(await propertyResourceRequest<{ deleted: number }>('tenancies', { method: 'DELETE' }, { id: tenancyId }));
}

export async function deleteTenanciesByProperty(propertyId: number): Promise<boolean> {
    return Boolean(await propertyResourceRequest<{ deleted: number }>('tenancies', { method: 'DELETE' }, { propertyId }));
}
