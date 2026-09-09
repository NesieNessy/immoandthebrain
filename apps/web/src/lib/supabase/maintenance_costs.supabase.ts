// ==============================================================================
// ImmoAndTheBrain – Supabase Client: maintenance_costs
// ==============================================================================
import { authFetch } from '@/lib/api/authFetch';
import { supabase } from '@/lib/supabase/client.supabase';
import type { MaintenanceCosts, MaintenanceCostsInsert, MaintenanceCostsUpdate, MaintenanceCostItem } from '@immoandthebrain/types';

function toMaintenanceCosts(row: Record<string, unknown>): MaintenanceCosts {
  return {
    maintenanceCostsId:             row.maintenance_costs_id as number,
    propertyId:                     row.property_id as number,
    costBreakdown:                  row.cost_breakdown as boolean,
    allocableCosts:                 row.allocable_costs as number | null,
    nonAllocableCosts:              row.non_allocable_costs as number | null,
    totalCosts:                     row.total_costs as number | null,
    houseMoney:                     row.house_money as number | null,
    allocableCostsProjection:       row.allocable_costs_projection as boolean,
    nonAllocableCostsProjection:    row.non_allocable_costs_projection as boolean,
    totalCostsProjection:           row.total_costs_projection as boolean,
    costItems:                      row.cost_items as MaintenanceCostItem[] | null,
    createdAt:                      row.created_at as string,
    updatedAt:                      row.updated_at as string,
  };
}

// getMaintenanceCosts (list) and deleteMaintenanceCosts are unused elsewhere in
// the app — left on the direct Supabase client since converting dead code
// isn't part of this fix.

export async function getMaintenanceCosts(propertyId: number): Promise<MaintenanceCosts[]> {
  const { data, error } = await supabase
    .from('maintenance_costs')
    .select('*')
    .eq('property_id', propertyId)
    .order('created_at', { ascending: false });
  if (error || !data) return [];
  return data.map(toMaintenanceCosts);
}

export async function deleteMaintenanceCosts(maintenanceCostsId: number): Promise<boolean> {
  const { error } = await supabase.from('maintenance_costs').delete().eq('maintenance_costs_id', maintenanceCostsId);
  return !error;
}

// get-by-id/create/update go through /api/maintenance-costs (server-side,
// service-role DB pool) rather than the browser Supabase client directly —
// same reasoning as tenancy_move_out.supabase.ts: the RLS policies on this
// table check auth.uid(), which is never set under auth-bypass mode, so a
// direct client call silently fails there, and the callers (useTenantUnitData
// and useServiceChargeSettlementData) showed a "saved" toast regardless.

export async function getMaintenanceCostsById(maintenanceCostsId: number): Promise<MaintenanceCosts | null> {
  const res = await authFetch(`/api/maintenance-costs?id=${maintenanceCostsId}`);
  if (!res.ok) return null;
  return res.json();
}

export async function createMaintenanceCosts(payload: MaintenanceCostsInsert): Promise<MaintenanceCosts | null> {
  const res = await authFetch('/api/maintenance-costs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) return null;
  return res.json();
}

export async function updateMaintenanceCosts(maintenanceCostsId: number, updates: MaintenanceCostsUpdate): Promise<MaintenanceCosts | null> {
  const res = await authFetch('/api/maintenance-costs', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ maintenanceCostsId, ...updates }),
  });
  if (!res.ok) return null;
  return res.json();
}
