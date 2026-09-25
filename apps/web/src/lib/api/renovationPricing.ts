import { authFetch } from '@/lib/api/authFetch';
import type { PriceIndicationContext } from '@/lib/renovation/catalog';

export interface PropertyPricingContext extends PriceIndicationContext {
  postalCode: string;
}

/** Region factor + living area of a property, for indicatePriceRange. Null on failure. */
export async function getPropertyPricingContext(propertyId: number): Promise<PropertyPricingContext | null> {
  const response = await authFetch(`/api/renovation/pricing-context?propertyId=${propertyId}`, { cache: 'no-store' });
  if (!response.ok) return null;
  return await response.json() as PropertyPricingContext;
}
