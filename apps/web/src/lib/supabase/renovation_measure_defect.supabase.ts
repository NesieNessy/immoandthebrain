import { jsonRequest, propertyResourceRequest } from '@/lib/api/propertyResources';
import type { RenovationMeasureDefect, RenovationMeasureDefectInsert } from '@immoandthebrain/types';

function toDefect(row: Record<string, unknown>): RenovationMeasureDefect {
    return {
        renovationMeasureDefectId: row.renovation_measure_defect_id as number,
        renovationMeasureId: row.renovation_measure_id as number,
        propertyId: row.property_id as number,
        sortOrder: row.sort_order as number,
        description: row.description as string,
        createdAt: row.created_at as string,
    };
}

export async function getDefectsByMeasure(measureId: number): Promise<RenovationMeasureDefect[]> {
    const data = await propertyResourceRequest<Record<string, unknown>[]>('renovation-measure-defects', {}, { measureId });
    return data?.map(toDefect) ?? [];
}

export async function createDefect(payload: RenovationMeasureDefectInsert): Promise<RenovationMeasureDefect | null> {
    const data = await propertyResourceRequest<Record<string, unknown>>('renovation-measure-defects', jsonRequest('POST', { values: {
        renovation_measure_id: payload.renovationMeasureId,
        property_id: payload.propertyId,
        sort_order: payload.sortOrder,
        description: payload.description,
    } }));
    if (!data) return null;
    return toDefect(data);
}

export async function deleteDefect(renovationMeasureDefectId: number): Promise<boolean> {
    return Boolean(await propertyResourceRequest<{ deleted: number }>('renovation-measure-defects', { method: 'DELETE' }, { id: renovationMeasureDefectId }));
}
