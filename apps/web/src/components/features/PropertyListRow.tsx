"use client";

import { getPropertyCardColor, PROPERTY_CATEGORY_LABEL, PROPERTY_CATEGORY_VARIANT } from '@/components/features/PropertyDisplay';
import { Button, Icons, Tag, type MenuItem } from '@/components/ui';
import type { PropertyOverview } from '@/lib/supabase/property.supabase';
import { resolvePropertyImageSrc, cn } from '@/lib/utils';

interface PropertyListRowProps {
  property: PropertyOverview;
  colorIndex: number;
  menuItems: MenuItem[];
  onClick: () => void;
}

export function PropertyListRow({ property, colorIndex, menuItems, onClick }: PropertyListRowProps) {
  const photo = resolvePropertyImageSrc(property.imageUrl);
  const categoryLabel = property.propertyCategory
    ? PROPERTY_CATEGORY_LABEL[property.propertyCategory] ?? property.propertyCategory
    : null;

  return (
    <div
      onClick={onClick}
      className="flex items-center gap-4 bg-card border border-border rounded-lg p-3 cursor-pointer transition-all duration-200 hover:shadow-lg hover:border-primary/50"
    >
      <div
        className={cn(
          "relative w-16 h-16 rounded-md overflow-hidden flex items-center justify-center shrink-0",
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
          <Icons.Home className="w-7 h-7 text-white/85" strokeWidth={1.5} />
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <h3 className="text-sm font-semibold text-foreground truncate">
            {property.street} {property.houseNumber}
          </h3>
          {categoryLabel && (
            <Tag
              label={categoryLabel}
              variant={PROPERTY_CATEGORY_VARIANT[property.propertyCategory!] ?? 'default'}
              size="md"
            />
          )}
        </div>
        <p className="text-xs text-muted-foreground truncate">{property.postalCode} {property.city}</p>
      </div>

      <div className="hidden sm:flex items-center gap-6 text-xs text-muted-foreground shrink-0">
        <div className="text-right">
          <p className="uppercase tracking-wide">Wohnfläche</p>
          <p className="font-medium text-foreground">{property.squareMeters ? `${property.squareMeters} m²` : '—'}</p>
        </div>
        <div className="text-right">
          <p className="uppercase tracking-wide">Baujahr</p>
          <p className="font-medium text-foreground">{property.yearOfConstruction || '—'}</p>
        </div>
        <div className="text-right">
          <p className="uppercase tracking-wide">Kaufpreis</p>
          <p className="font-medium text-foreground">
            {property.purchasePrice ? `${property.purchasePrice.toLocaleString('de-DE')} €` : '—'}
          </p>
        </div>
      </div>

      <div className="hidden md:flex items-center gap-2 shrink-0">
        <Tag label={property.isRented ? 'Vermietet' : 'Unvermietet'} variant={property.isRented ? 'success' : 'warning'} size="md" />
        {property.archivedAt && <Tag label="Archiviert" variant="muted" size="md" />}
      </div>

      <div className="shrink-0" onClick={(e) => e.stopPropagation()}>
        <Button
          iconOnly
          icon={<Icons.MoreVertical className="w-4 h-4" />}
          variant="ghost"
          size="sm"
          menuItems={menuItems}
        />
      </div>
    </div>
  );
}
