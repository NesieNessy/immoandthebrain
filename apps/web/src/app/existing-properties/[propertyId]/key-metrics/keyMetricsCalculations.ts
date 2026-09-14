import { roundCurrency } from '@/lib/detailCheck/acquisitionCosts';
import { addYears, differenceInCalendarMonths, format } from 'date-fns';

/** Change in an amount over time, both as an absolute delta and a percentage
 *  of the starting value (0 when there is no baseline to compare against). */
export interface DevelopmentResult {
  initial: number;
  current: number;
  absoluteChange: number;
  percentChange: number;
}

export function computeDevelopment(initial: number, current: number): DevelopmentResult {
  const absoluteChange = roundCurrency(current - initial);
  const percentChange = initial > 0 ? roundCurrency((absoluteChange / initial) * 100) : 0;
  return { initial, current, absoluteChange, percentChange };
}

/** Monthly annuity payment (interest + repayment) on the remaining loan
 *  balance — the standard German Annuitätendarlehen formula. */
export function computeMonthlyDebtService(loanAmount: number, interestRatePercent: number, repaymentRatePercent: number): number {
  if (loanAmount <= 0) return 0;
  return roundCurrency((loanAmount * ((interestRatePercent + repaymentRatePercent) / 100)) / 12);
}

/** Net monthly surplus/deficit after debt service and non-recoupable
 *  (landlord-borne) running costs are deducted from the cold rent. */
export function computeCashFlow(coldRent: number, monthlyDebtService: number, nonAllocableMonthlyCosts: number): number {
  return roundCurrency(coldRent - monthlyDebtService - nonAllocableMonthlyCosts);
}

/** Cold rent, compounded at the observed annual growth rate, `years` into
 *  the future — used to forecast cash flow at the end of the current
 *  fixed-interest period (the annuity payment itself stays flat until then). */
export function projectRent(currentColdRent: number, annualGrowthPercent: number, years: number): number {
  return roundCurrency(currentColdRent * Math.pow(1 + annualGrowthPercent / 100, years));
}

export function computeGrossYield(annualColdRent: number, purchasePrice: number): number {
  return purchasePrice > 0 ? roundCurrency((annualColdRent / purchasePrice) * 100) : 0;
}

export function computeNetYield(annualColdRent: number, annualNonAllocableCosts: number, purchasePrice: number): number {
  return purchasePrice > 0 ? roundCurrency(((annualColdRent - annualNonAllocableCosts) / purchasePrice) * 100) : 0;
}

export function computeReturnOnEquity(annualCashFlow: number, equity: number): number {
  return equity > 0 ? roundCurrency((annualCashFlow / equity) * 100) : 0;
}

export function computePricePerSqm(purchasePrice: number, squareMeters: number): number {
  return squareMeters > 0 ? roundCurrency(purchasePrice / squareMeters) : 0;
}

/**
 * Germany's ten-year Spekulationsfrist (§23 EStG) for privately held real
 * estate: a sale becomes tax-free ten years (to the day) after acquisition.
 */
export function computeTaxFreeSaleDate(purchaseDate: string): Date {
  return addYears(new Date(purchaseDate), 10);
}

/** "3 J. 4 M." until `targetDate`, or null once it has already passed. */
export function formatYearsMonthsUntil(targetDate: Date, from: Date = new Date()): string | null {
  const totalMonths = differenceInCalendarMonths(targetDate, from);
  if (totalMonths <= 0) return null;
  const years = Math.floor(totalMonths / 12);
  const months = totalMonths % 12;
  if (years === 0) return `${months} M.`;
  if (months === 0) return `${years} J.`;
  return `${years} J. ${months} M.`;
}

export function formatTaxFreeSaleDate(targetDate: Date): string {
  return format(targetDate, 'MMM yyyy');
}
