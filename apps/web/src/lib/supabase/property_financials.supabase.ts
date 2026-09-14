import { jsonRequest, propertyResourceRequest } from '@/lib/api/propertyResources';
import type { PropertyFinancials, PropertyFinancialsInsert } from '@immoandthebrain/types';

function toPropertyFinancials(row: Record<string, unknown>): PropertyFinancials {
  return {
    propertyFinancialsId:     row.property_financials_id as number,
    propertyId:               row.property_id as number,
    currentMarketValue:       row.current_market_value == null ? null : Number(row.current_market_value),
    loanAmount:               row.loan_amount == null ? null : Number(row.loan_amount),
    equity:                   row.equity == null ? null : Number(row.equity),
    interestRate:             row.interest_rate == null ? null : Number(row.interest_rate),
    repaymentRate:            row.repayment_rate == null ? null : Number(row.repayment_rate),
    fixedInterestPeriodYears: row.fixed_interest_period_years == null ? null : Number(row.fixed_interest_period_years),
    createdAt:                row.created_at as string,
    updatedAt:                row.updated_at as string,
  };
}

// ----------------------------------------------------------------------------
// Queries
// ----------------------------------------------------------------------------

export async function getPropertyFinancialsByProperty(propertyId: number): Promise<PropertyFinancials | null> {
  const data = await propertyResourceRequest<Record<string, unknown>>('property-financials', {}, { propertyId, single: true });
  if (!data) return null;
  return toPropertyFinancials(data);
}

// ----------------------------------------------------------------------------
// Mutations
// ----------------------------------------------------------------------------

export async function upsertPropertyFinancials(payload: PropertyFinancialsInsert): Promise<PropertyFinancials | null> {
  const data = await propertyResourceRequest<Record<string, unknown>>('property-financials', jsonRequest('POST', { upsert: true, values: {
        property_id:                 payload.propertyId,
        current_market_value:        payload.currentMarketValue,
        loan_amount:                 payload.loanAmount,
        equity:                      payload.equity,
        interest_rate:               payload.interestRate,
        repayment_rate:              payload.repaymentRate,
        fixed_interest_period_years: payload.fixedInterestPeriodYears,
      } }));
  if (!data) return null;
  return toPropertyFinancials(data);
}
