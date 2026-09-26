import { describe, expect, it } from 'vitest';
import { computeFinancing, computeIndividualAdditionalCosts, estimateInterestRate, INTEREST_RATES } from './financing';

describe('estimateInterestRate (Finanzierung)', () => {
  it('uses the base rate for the chosen interest period', () => {
    expect(estimateInterestRate(10)).toBe(INTEREST_RATES[10]);
    expect(estimateInterestRate(15)).toBe(INTEREST_RATES[15]);
    expect(estimateInterestRate(20)).toBe(INTEREST_RATES[20]);
  });

  it('scales the rate by the adjustment factor, rounded to two decimals', () => {
    expect(estimateInterestRate(10, 1.1)).toBe(3.74);
  });
});

describe('computeFinancing', () => {
  const base = {
    purchasePrice: 300000,
    parkingPrice: 0,
    additionalCosts: 27210,
    renovationCosts: 0,
    equity: 60000,
    interestPeriodYears: 10 as const,
  };

  it('derives loan, loan-to-cost and monthly debt service from total costs and equity', () => {
    expect(computeFinancing(base)).toEqual({
      totalCosts: 327210,
      loanAmount: 267210,
      loanToCostPercent: 81.66,
      interestRate: 3.4,
      // 267.210 × (3,4 % + 2 % Tilgung) ÷ 12
      monthlyDebtService: 1202.45,
    });
  });

  it('adds parking and renovation costs to the total', () => {
    const result = computeFinancing({ ...base, parkingPrice: 15000, renovationCosts: 25500 });
    expect(result.totalCosts).toBe(367710);
    expect(result.loanAmount).toBe(307710);
  });

  it('uses the given repayment rate for the debt service', () => {
    const result = computeFinancing({ ...base, repaymentRate: 3 });
    expect(result.monthlyDebtService).toBe(1425.12); // 267.210 × (3,4 % + 3 %) ÷ 12
  });

  it('never has a negative loan when equity exceeds the total costs', () => {
    const result = computeFinancing({ ...base, equity: 500000 });
    expect(result.loanAmount).toBe(0);
    expect(result.loanToCostPercent).toBe(0);
    expect(result.monthlyDebtService).toBe(0);
  });

  it('has a loan-to-cost of 0 instead of dividing by zero when nothing costs anything', () => {
    const result = computeFinancing({ ...base, purchasePrice: 0, additionalCosts: 0, equity: 0 });
    expect(result.totalCosts).toBe(0);
    expect(result.loanToCostPercent).toBe(0);
  });
});

describe('computeIndividualAdditionalCosts', () => {
  it('recomputes the Kaufnebenkosten for an individually entered purchase price', () => {
    expect(computeIndividualAdditionalCosts({
      purchasePrice: 280000,
      parkingPrice: 0,
      brokerPercent: 3.57,
      notaryPercent: 1.5,
      landRegistryPercent: 0.5,
      propertyTransferTaxPercent: 3.5,
    })).toBe(25396); // 9,07 % of 280.000
  });
});
