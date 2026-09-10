'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRequireAuth } from '@/hooks/useRequireAuth';
import {
  deletePropertyImage,
  getPropertyImages,
  setCoverPropertyImage,
  uploadPropertyImage,
} from '@/lib/supabase/property_image.supabase';
import type { PropertyImage } from '@immoandthebrain/types';

/** Must match the `property-images` Storage bucket's `allowed_mime_types`
 *  (supabase/migrations/20260828000001_property_image.sql) — checked here
 *  too so an unsupported file (e.g. SVG) gets a clear message immediately
 *  instead of an opaque Storage-upload error. */
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

/** Loads and mutates one property's photo gallery — used by
 *  `PropertyImageGallery`, kept separate so the gallery's data logic is
 *  testable independently of its markup. */
export function usePropertyImages(propertyId: number) {
  const { user } = useRequireAuth();
  const [images, setImages] = useState<PropertyImage[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const data = await getPropertyImages(propertyId);
    setImages(data);
    setIsLoading(false);
  }, [propertyId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const upload = async (files: FileList | null) => {
    if (!files || files.length === 0 || !user) return;
    setIsUploading(true);
    setError(null);
    try {
      const rejected = Array.from(files).filter((file) => !ALLOWED_MIME_TYPES.includes(file.type));
      const accepted = Array.from(files).filter((file) => ALLOWED_MIME_TYPES.includes(file.type));

      for (const file of accepted) {
        const result = await uploadPropertyImage(user.id, propertyId, file);
        if (result.error) {
          setError(result.error);
          break;
        }
      }

      if (rejected.length > 0) {
        setError(`Nicht unterstütztes Format (nur JPEG, PNG oder WEBP): ${rejected.map((f) => f.name).join(', ')}`);
      }

      await refresh();
    } finally {
      setIsUploading(false);
    }
  };

  const setCover = async (propertyImageId: number) => {
    await setCoverPropertyImage(propertyId, propertyImageId);
    await refresh();
  };

  const remove = async (image: PropertyImage) => {
    await deletePropertyImage(propertyId, image.propertyImageId, image.storagePath);
    await refresh();
  };

  return { images, isLoading, isUploading, error, upload, setCover, remove };
}
