import { jsonRequest, propertyResourceRequest } from '@/lib/api/propertyResources';
import { supabase } from '@/lib/supabase/client.supabase';
import type { RenovationMeasurePhoto } from '@immoandthebrain/types';

const BUCKET = 'renovation-measure-files';

function toPhoto(row: Record<string, unknown>): RenovationMeasurePhoto {
    return {
        renovationMeasurePhotoId: row.renovation_measure_photo_id as number,
        renovationMeasureId: row.renovation_measure_id as number,
        propertyId: row.property_id as number,
        storagePath: row.storage_path as string,
        fileName: row.file_name as string,
        createdAt: row.created_at as string,
    };
}

export async function getPhotosByMeasure(measureId: number): Promise<RenovationMeasurePhoto[]> {
    const data = await propertyResourceRequest<Record<string, unknown>[]>('renovation-measure-photos', {}, { measureId });
    return data?.map(toPhoto) ?? [];
}

/** Signed URL for viewing/downloading — the bucket is private. */
export async function getPhotoUrl(storagePath: string): Promise<string | null> {
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(storagePath, 60);
    if (error || !data) return null;
    return data.signedUrl;
}

export async function uploadPhoto(userId: string, propertyId: number, measureId: number, file: File): Promise<RenovationMeasurePhoto | null> {
    const storagePath = `${userId}/${propertyId}/${measureId}/photo-${crypto.randomUUID()}-${file.name}`;
    const { error: uploadError } = await supabase.storage.from(BUCKET).upload(storagePath, file, { contentType: file.type || undefined });
    if (uploadError) return null;

    const data = await propertyResourceRequest<Record<string, unknown>>('renovation-measure-photos', jsonRequest('POST', { values: {
        renovation_measure_id: measureId,
        property_id: propertyId,
        storage_path: storagePath,
        file_name: file.name,
    } }));
    if (!data) {
        await supabase.storage.from(BUCKET).remove([storagePath]);
        return null;
    }
    return toPhoto(data);
}

export async function deletePhoto(renovationMeasurePhotoId: number, storagePath: string): Promise<boolean> {
    await supabase.storage.from(BUCKET).remove([storagePath]);
    return Boolean(await propertyResourceRequest<{ deleted: number }>('renovation-measure-photos', { method: 'DELETE' }, { id: renovationMeasurePhotoId }));
}
