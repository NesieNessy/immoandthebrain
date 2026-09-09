import { jsonRequest, propertyResourceRequest } from '@/lib/api/propertyResources';
import type {
    ParkingSpace,
    ParkingSpaceInsert,
    ParkingSpaceType,
    ParkingSpaceUpdate,
} from '@immoandthebrain/types';

function toParkingSpace(row: Record<string, unknown>): ParkingSpace {
  return {
    parkingSpaceId:        row.parking_space_id as number,
    propertyId:            row.property_id as number,
    parkingSpaceType:      row.parking_space_type as ParkingSpaceType | null,
    numberOfParkingSpaces: row.number_of_parking_spaces as number | null,
    createdAt:             row.created_at as string,
    updatedAt:             row.updated_at as string,
  };
}

// ----------------------------------------------------------------------------
// Queries
// ----------------------------------------------------------------------------

export async function getParkingSpacesByProperty(propertyId: number): Promise<ParkingSpace[]> {
  const data = await propertyResourceRequest<Record<string, unknown>[]>('parking-spaces', {}, { propertyId });
  return data?.map(toParkingSpace) ?? [];
}

export async function getParkingSpaceById(parkingSpaceId: number): Promise<ParkingSpace | null> {
  const data = await propertyResourceRequest<Record<string, unknown>>('parking-spaces', {}, { id: parkingSpaceId });
  if (!data) return null;
  return toParkingSpace(data);
}

// ----------------------------------------------------------------------------
// Mutations
// ----------------------------------------------------------------------------

export async function createParkingSpace(payload: ParkingSpaceInsert): Promise<ParkingSpace | null> {
  const data = await propertyResourceRequest<Record<string, unknown>>('parking-spaces', jsonRequest('POST', { values: {
      property_id:              payload.propertyId,
      parking_space_type:       payload.parkingSpaceType,
      number_of_parking_spaces: payload.numberOfParkingSpaces,
    } }));
  if (!data) return null;
  return toParkingSpace(data);
}

export async function updateParkingSpace(
  parkingSpaceId: number,
  updates: ParkingSpaceUpdate,
): Promise<ParkingSpace | null> {
  const dbUpdates: Record<string, unknown> = {};
  if (updates.propertyId !== undefined)            dbUpdates.property_id              = updates.propertyId;
  if (updates.parkingSpaceType !== undefined)      dbUpdates.parking_space_type       = updates.parkingSpaceType;
  if (updates.numberOfParkingSpaces !== undefined) dbUpdates.number_of_parking_spaces = updates.numberOfParkingSpaces;

  const data = await propertyResourceRequest<Record<string, unknown>>('parking-spaces', jsonRequest('PATCH', { id: parkingSpaceId, values: dbUpdates }));
  if (!data) return null;
  return toParkingSpace(data);
}

export async function deleteParkingSpace(parkingSpaceId: number): Promise<boolean> {
  return Boolean(await propertyResourceRequest<{ deleted: number }>('parking-spaces', { method: 'DELETE' }, { id: parkingSpaceId }));
}

export async function deleteParkingSpacesByProperty(propertyId: number): Promise<boolean> {
  return Boolean(await propertyResourceRequest<{ deleted: number }>('parking-spaces', { method: 'DELETE' }, { propertyId }));
}
