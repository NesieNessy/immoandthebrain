"use client";

import { computePriceSplitIndividual, computePriceSplitStandard, usefulLifeByCategory } from '@/lib/detailCheck/depreciation';
import { getCityPurchasePriceSplit } from '@/lib/supabase/city_purchase_price_split.supabase';
import { getMaintenanceCostsById } from '@/lib/supabase/maintenance_costs.supabase';
import { getPropertyAcquisitionByProperty } from '@/lib/supabase/property_acquisition.supabase';
import { getPropertyFinancialsByProperty, upsertPropertyFinancials } from '@/lib/supabase/property_financials.supabase';
import { getPropertyOverviewById, type PropertyOverview } from '@/lib/supabase/property.supabase';
import { getPropertyPriceSplitByProperty } from '@/lib/supabase/property_price_split.supabase';
import { getPropertyRndByProperty } from '@/lib/supabase/property_rnd.supabase';
import { getPropertyUnitsByProperty } from '@/lib/supabase/property_unit.supabase';
import { getCurrentTenancyByUnit } from '@/lib/supabase/tenancy.supabase';
import type { PropertyFinancialsUpdate, PropertyRnd, PropertyUnit } from '@immoandthebrain/types';
import { useEffect, useMemo, useState } from 'react';

export interface KeyMetricsAggregates {
  livingAreaM2: number;
  targetColdRentTotal: number;
  currentColdRentTotal: number;
  nonAllocableMonthlyCostsTotal: number;
  buildingSharePercent: number;
  buildingValue: number;
  rnd: PropertyRnd | null;
  totalUsefulLifeYears: number;
}

export function useKeyMetricsData(propertyId: string) {
  const [property, setProperty] = useState<PropertyOverview | null>(null);
  const [units, setUnits] = useState<PropertyUnit[]>([]);
  const [currentColdRentTotal, setCurrentColdRentTotal] = useState(0);
  const [nonAllocableMonthlyCostsTotal, setNonAllocableMonthlyCostsTotal] = useState(0);
  const [purchaseDate, setPurchaseDate] = useState<string | null>(null);
  const [rnd, setRnd] = useState<PropertyRnd | null>(null);
  const [buildingSharePercent, setBuildingSharePercent] = useState(65);
  const [buildingValue, setBuildingValue] = useState(0);
  const [financials, setFinancials] = useState<PropertyFinancialsUpdate & { propertyFinancialsId?: number }>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const id = parseInt(propertyId, 10);

    Promise.all([
      getPropertyOverviewById(id),
      getPropertyUnitsByProperty(id),
      getPropertyAcquisitionByProperty(id),
      getPropertyRndByProperty(id),
      getPropertyPriceSplitByProperty(id),
      getPropertyFinancialsByProperty(id),
    ]).then(async ([foundProperty, foundUnits, acquisition, foundRnd, priceSplit, foundFinancials]) => {
      if (cancelled) return;

      const tenancies = await Promise.all(foundUnits.map((unit) => getCurrentTenancyByUnit(unit.propertyUnitId)));
      if (cancelled) return;

      const coldRentTotal = tenancies.reduce((sum, tenancy) => sum + (tenancy?.coldRent ?? 0), 0);

      const maintenanceCostsList = await Promise.all(
        tenancies.map((tenancy) => (tenancy?.maintenanceCostsId ? getMaintenanceCostsById(tenancy.maintenanceCostsId) : Promise.resolve(null))),
      );
      if (cancelled) return;
      const nonAllocableTotal = maintenanceCostsList.reduce((sum, mc) => sum + (mc?.nonAllocableCosts ?? 0), 0);

      const purchasePrice = foundProperty?.purchasePrice ?? 0;
      const cityShare = foundProperty ? await getCityPurchasePriceSplit(foundProperty.city) : { buildingSharePercent: 65, landSharePercent: 35 };
      if (cancelled) return;

      const standardSplit = computePriceSplitStandard(purchasePrice, cityShare.buildingSharePercent);
      const selectedSplit = priceSplit?.splitMode === 'INDIVIDUAL'
        ? computePriceSplitIndividual({
            purchasePrice,
            landReferenceValue: priceSplit.landReferenceValue ?? 0,
            plotAreaM2: priceSplit.plotAreaM2 ?? 0,
            coOwnershipNumerator: priceSplit.coOwnershipNumerator ?? 0,
            coOwnershipDenominator: priceSplit.coOwnershipDenominator ?? 0,
          })
        : standardSplit;

      setProperty(foundProperty);
      setUnits(foundUnits);
      setCurrentColdRentTotal(coldRentTotal);
      setNonAllocableMonthlyCostsTotal(nonAllocableTotal);
      setPurchaseDate(acquisition?.purchaseDate ?? null);
      setRnd(foundRnd);
      setBuildingSharePercent(selectedSplit.buildingSharePercent);
      setBuildingValue(selectedSplit.buildingValue);
      setFinancials(foundFinancials ?? {});
      setIsLoading(false);
    });

    return () => { cancelled = true; };
  }, [propertyId]);

  const aggregates: KeyMetricsAggregates = useMemo(() => ({
    livingAreaM2: units.reduce((sum, unit) => sum + (unit.livingAreaM2 ?? 0), 0),
    targetColdRentTotal: units.reduce((sum, unit) => sum + (unit.targetColdRent ?? 0), 0),
    currentColdRentTotal,
    nonAllocableMonthlyCostsTotal,
    buildingSharePercent,
    buildingValue,
    rnd,
    totalUsefulLifeYears: usefulLifeByCategory(property?.propertyCategory),
  }), [units, currentColdRentTotal, nonAllocableMonthlyCostsTotal, buildingSharePercent, buildingValue, rnd, property]);

  const saveFinancials = async (updates: PropertyFinancialsUpdate) => {
    const id = parseInt(propertyId, 10);
    setIsSaving(true);
    try {
      const merged = { ...financials, ...updates };
      const saved = await upsertPropertyFinancials({
        propertyId: id,
        currentMarketValue: merged.currentMarketValue ?? null,
        loanAmount: merged.loanAmount ?? null,
        equity: merged.equity ?? null,
        interestRate: merged.interestRate ?? null,
        repaymentRate: merged.repaymentRate ?? null,
        fixedInterestPeriodYears: merged.fixedInterestPeriodYears ?? null,
      });
      if (saved) setFinancials(saved);
      return saved;
    } finally {
      setIsSaving(false);
    }
  };

  return {
    property,
    purchaseDate,
    financials,
    aggregates,
    isLoading,
    isSaving,
    saveFinancials,
  };
}
