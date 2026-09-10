"use client";

import { getPropertyCardColor, PROPERTY_CATEGORY_LABEL, PROPERTY_CATEGORY_VARIANT } from '@/components/features/PropertyDisplay';
import { Button, Icons, Tag, type MenuItem } from '@/components/ui';
import type { PropertyOverview } from '@/lib/supabase/property.supabase';
import { resolvePropertyImageSrc, cn } from '@/lib/utils';

interface PropertyCardProps {
  property: PropertyOverview;
  /** Picks the accent color when there's no photo — position in the
   *  currently displayed list, not the property's id, so colors stay
   *  visually varied across a page regardless of which properties are on it. */
  colorIndex: number;
  menuItems: MenuItem[];
  onClick: () => void;
}

export function PropertyCard({ property, colorIndex, menuItems, onClick }: PropertyCardProps) {
  const photo = resolvePropertyImageSrc(property.imageUrl);
  const categoryLabel = property.propertyCategory
    ? PROPERTY_CATEGORY_LABEL[property.propertyCategory] ?? property.propertyCategory
    : null;

  return (
    <div
      onClick={onClick}
      className="bg-card border border-border rounded-lg overflow-hidden transition-all duration-200 cursor-pointer hover:shadow-lg hover:border-primary/50 h-full flex flex-col"
    >
      <div
        className={cn(
          "relative h-40 flex items-center justify-center shrink-0",
          photo ? "bg-muted" : getPropertyCardColor(colorIndex)
        )}
      >
        {photo ? (
          <img
            src={photo}
            alt={`${property.street} ${property.houseNumber}`}
            className="w-full h-full object-cover"
          />
        ) : (
          <Icons.Home className="w-14 h-14 text-white/85" strokeWidth={1.5} />
        )}

        <div className="absolute top-2 right-2" onClick={(e) => e.stopPropagation()}>
          <Button
            iconOnly
            icon={<Icons.MoreVertical className="w-4 h-4" />}
            variant="ghost"
            size="sm"
            className="bg-card/90 hover:bg-card shadow-sm"
            menuItems={menuItems}
          />
        </div>
      </div>

      <div className="p-4 flex-1 flex flex-col">
        <h3 className="text-base font-semibold text-foreground">{property.street} {property.houseNumber}</h3>
        <p className="text-sm text-muted-foreground mb-3">{property.postalCode} {property.city}</p>

        <div className="grid grid-cols-3 gap-2 pb-3 border-b border-border text-xs">
          <div>
            <p className="text-muted-foreground uppercase tracking-wide">Wohnfläche</p>
            <p className="font-medium text-foreground">
              {property.squareMeters ? `${property.squareMeters} m²` : '—'}
            </p>
          </div>
          <div>
            <p className="text-muted-foreground uppercase tracking-wide">Baujahr</p>
            <p className="font-medium text-foreground">{property.yearOfConstruction || '—'}</p>
          </div>
          <div>
            <p className="text-muted-foreground uppercase tracking-wide">Kaufpreis</p>
            <p className="font-medium text-foreground">
              {property.purchasePrice ? `${property.purchasePrice.toLocaleString('de-DE')} €` : '—'}
            </p>
          </div>
        </div>

        <div className="pt-3 mt-auto flex items-center gap-2 flex-wrap">
          {categoryLabel && (
            <Tag
              label={categoryLabel}
              variant={PROPERTY_CATEGORY_VARIANT[property.propertyCategory!] ?? 'default'}
              size="md"
            />
          )}
          <Tag label={property.isRented ? 'Vermietet' : 'Unvermietet'} variant={property.isRented ? 'success' : 'warning'} size="md" />
          {property.archivedAt && <Tag label="Archiviert" variant="muted" size="md" />}
        </div>
      </div>
    </div>
  );
}
