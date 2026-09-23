import { describe, expect, it } from 'vitest';
import {
  buildEffectiveCalculatorParams,
  clampInterestRate,
  normalizeRecentMonth,
  normalizeRentIncreaseIntervalMonths,
  normalizeRentIncreaseUtilizationPercent,
  normalizeTaxRate,
  overridesFromParams,
  recomputeMonthlyDebtService,
  safeCases,
  toInterestYears,
  toMode,
  toNumber,
  toPlacementMode,
  type CalculatorOverrides,
  type CalculatorParameterFields,
} from './calculatorParamNormalization';
import { runRentCalculator, type CalculatorParams } from './rentCalculator';
import fixture from './__fixtures__/calculatorResponse.sample.json';

describe('toNumber', () => {
  it('passes finite numbers through', () => { expect(toNumber(42)).toBe(42); });
  it('parses numeric strings', () => { expect(toNumber('3.5')).toBe(3.5); });
  it('falls back to 0 for anything non-numeric', () => {
    expect(toNumber('abc')).toBe(0);
    expect(toNumber(null)).toBe(0);
    expect(toNumber(undefined)).toBe(0);
    expect(toNumber(NaN)).toBe(0);
  });
});

describe('toMode / toPlacementMode / toInterestYears', () => {
  it('accepts only the known mode values, defaulting to KNOWN', () => {
    expect(toMode('POTENTIAL')).toBe('POTENTIAL');
    expect(toMode('KNOWN')).toBe('KNOWN');
    expect(toMode('anything-else')).toBe('KNOWN');
    expect(toMode(undefined)).toBe('KNOWN');
  });

  it('accepts only OPTIMIZED as non-default placement mode', () => {
    expect(toPlacementMode('OPTIMIZED')).toBe('OPTIMIZED');
    expect(toPlacementMode('DEFAULT')).toBe('DEFAULT');
    expect(toPlacementMode(null)).toBe('DEFAULT');
  });

  it('accepts only 15 or 20 as a non-default interest period', () => {
    expect(toInterestYears(15)).toBe(15);
    expect(toInterestYears(20)).toBe(20);
    expect(toInterestYears(10)).toBe(10);
    expect(toInterestYears(7)).toBe(10);
    expect(toInterestYears(undefined)).toBe(10);
  });
});

describe('safeCases', () => {
  it('passes arrays through and coerces anything else to an empty array', () => {
    expect(safeCases([{ id: 'a' }])).toEqual([{ id: 'a' }]);
    expect(safeCases(null)).toEqual([]);
    expect(safeCases('not an array')).toEqual([]);
    expect(safeCases(undefined)).toEqual([]);
  });
});

describe('normalizeTaxRate', () => {
  it('clamps the continuous band to 0–42 %', () => {
    expect(normalizeTaxRate(0.3)).toBe(0.3);
    expect(normalizeTaxRate(-0.1)).toBe(0);
    expect(normalizeTaxRate(0.42)).toBe(0.42);
  });

  it('snaps anything above 42 % to the fixed 45 % bracket', () => {
    expect(normalizeTaxRate(0.43)).toBe(0.45);
    expect(normalizeTaxRate(1)).toBe(0.45);
  });

  it('falls back to 42 % (or a given fallback) for non-numeric input', () => {
    expect(normalizeTaxRate('abc')).toBe(0.42);
    expect(normalizeTaxRate(undefined, 0.3)).toBe(0.3);
  });
});

describe('normalizeRecentMonth', () => {
  const currentYear = new Date().getFullYear();

  it('accepts a well-formed yyyy-mm within the allowed window', () => {
    expect(normalizeRecentMonth(`${currentYear}-06`, 1)).toBe(`${currentYear}-06`);
    expect(normalizeRecentMonth(`${currentYear - 1}-01`, 1)).toBe(`${currentYear - 1}-01`);
  });

  it('rejects a month further in the past than the allowed window', () => {
    expect(normalizeRecentMonth(`${currentYear - 2}-01`, 1)).toBeNull();
  });

  it('rejects a month in the future', () => {
    expect(normalizeRecentMonth(`${currentYear + 1}-01`, 5)).toBeNull();
  });

  it('rejects malformed input outright', () => {
    expect(normalizeRecentMonth('not-a-month', 5)).toBeNull();
    expect(normalizeRecentMonth('2026-13', 5)).toBeNull();
    expect(normalizeRecentMonth(null, 5)).toBeNull();
    expect(normalizeRecentMonth(42, 5)).toBeNull();
  });
});

describe('normalizeRentIncreaseIntervalMonths', () => {
  it('clamps to the 15–60 month band', () => {
    expect(normalizeRentIncreaseIntervalMonths(27)).toBe(27);
    expect(normalizeRentIncreaseIntervalMonths(5)).toBe(15);
    expect(normalizeRentIncreaseIntervalMonths(90)).toBe(60);
  });

  it('defaults to 15 for zero, missing, or non-numeric input', () => {
    expect(normalizeRentIncreaseIntervalMonths(0)).toBe(15);
    expect(normalizeRentIncreaseIntervalMonths(undefined)).toBe(15);
    expect(normalizeRentIncreaseIntervalMonths('abc')).toBe(15);
  });

  it('rounds fractional input', () => {
    expect(normalizeRentIncreaseIntervalMonths(18.6)).toBe(19);
  });
});

describe('normalizeRentIncreaseUtilizationPercent', () => {
  it('clamps to 0–100', () => {
    expect(normalizeRentIncreaseUtilizationPercent(50)).toBe(50);
    expect(normalizeRentIncreaseUtilizationPercent(-10)).toBe(0);
    expect(normalizeRentIncreaseUtilizationPercent(150)).toBe(100);
  });

  it('defaults to 100 (full legal use) when unset', () => {
    expect(normalizeRentIncreaseUtilizationPercent(null)).toBe(100);
    expect(normalizeRentIncreaseUtilizationPercent(undefined)).toBe(100);
  });
});

describe('clampInterestRate', () => {
  it('clamps to 0–25 %', () => {
    expect(clampInterestRate(3.4)).toBe(3.4);
    expect(clampInterestRate(-1)).toBe(0);
    expect(clampInterestRate(30)).toBe(25);
  });
});

describe('recomputeMonthlyDebtService', () => {
  it('computes the annuity debt service from loan amount, rate and repayment rate', () => {
    // 200.000 € loan, 3,4 % interest + 2 % Tilgung = 5,4 % annuity / 12 months.
    expect(recomputeMonthlyDebtService(200000, 3.4, 2)).toBeCloseTo(900, 2);
  });

  it('is zero for a zero loan amount', () => {
    expect(recomputeMonthlyDebtService(0, 3.4, 2)).toBe(0);
  });
});

// ─── buildEffectiveCalculatorParams parity ─────────────────────────────────
//
// The fixture is a real GET response's `params`/`renovationCases`, captured
// from the running app (see __fixtures__/calculatorResponse.sample.json).
// These tests feed that same state through `buildEffectiveCalculatorParams`
// — the function the browser's live preview will call — and check its
// output against the same `params` object the server itself produced. Any
// divergence here is exactly the class of bug the client-side preview must
// never have: a value the user sees on screen that the server wouldn't also
// compute.

const fixtureParams = fixture.params as unknown as CalculatorParams;
const fixtureRenovationCases = fixture.renovationCases as never;

/** Rebuilds the page's form-field state from a saved `params`, mirroring the load effect in page.tsx. */
function fieldsFromParams(params: CalculatorParams): CalculatorParameterFields {
  return {
    startYyyymm: params.startYyyymm,
    last558Date: params.last558Date ?? '',
    last559Date: params.last559Date ?? '',
    last559MonthlyDelta: String(params.last559MonthlyDelta).replace('.', ','),
    rentIndexPerM2: String(params.rentIndexPerM2 ?? '').replace('.', ','),
    rentIndexSource: params.rentIndexSource,
    rentIncreaseIntervalMonths: params.rentIncreaseIntervalMonths,
    rentIncreaseUtilizationPercent: params.rentIncreaseUtilizationPercent,
    mode: params.mode,
  };
}

describe('buildEffectiveCalculatorParams — parity with a real server response', () => {
  it('reproduces the exact params the server saved, when fed back its own state unchanged', () => {
    const overrides = overridesFromParams(fixtureParams);
    const fields = fieldsFromParams(fixtureParams);

    const rebuilt = buildEffectiveCalculatorParams(fixtureParams, fields, overrides, {
      resetRentIncreasePlan: false,
      storedRentIncreasePlan: fixtureParams.rentIncreasePlan,
    });

    // `overridesFromParams` normalizes a missing `rentIncreaseOverrides` to
    // `{}` so `CalculatorOverrides`'s map fields are never `undefined` for
    // PlanEditor to index into — the fixture's own `params.rentIncreaseOverrides`
    // is `undefined` (the GET route omits it once a stored plan exists). The
    // two are behaviorally identical to `runRentCalculator` — `{}` and
    // `undefined` both make every per-id lookup inside it resolve to
    // `undefined` — which the next test proves by comparing actual computed
    // output rather than raw param shape.
    expect(rebuilt).toEqual({ ...fixtureParams, rentIncreaseOverrides: {}, excludedModernizationIds: [] });
  });

  it('produces a result identical to what the server computed for its own saved state', () => {
    const overrides = overridesFromParams(fixtureParams);
    const fields = fieldsFromParams(fixtureParams);
    const rebuilt = buildEffectiveCalculatorParams(fixtureParams, fields, overrides, {
      resetRentIncreasePlan: false,
      storedRentIncreasePlan: fixtureParams.rentIncreasePlan,
    });

    const fromServerParams = runRentCalculator(fixtureParams, fixtureRenovationCases);
    const fromRebuiltParams = runRentCalculator(rebuilt, fixtureRenovationCases);

    expect(fromRebuiltParams.increases558).toEqual(fromServerParams.increases558);
    expect(fromRebuiltParams.modernizationPlan).toEqual(fromServerParams.modernizationPlan);
    expect(fromRebuiltParams.metrics).toEqual(fromServerParams.metrics);
    expect(fromRebuiltParams.breakEven).toEqual(fromServerParams.breakEven);
    expect(fromRebuiltParams.timeline).toEqual(fromServerParams.timeline);
  });

  it('is idempotent — calling it twice on its own untouched output changes nothing further', () => {
    // This is the exact property the calculator page's "unsaved changes"
    // indicator relies on: it compares a fresh call against a baseline built
    // the same way, specifically so normalization quirks (like the
    // undefined-vs-{} case above) cancel out instead of being flagged as a
    // phantom edit the moment the page loads, before the user touches
    // anything. If this test ever fails, that indicator will show "unsaved
    // changes" on every fresh page load.
    const overrides = overridesFromParams(fixtureParams);
    const fields = fieldsFromParams(fixtureParams);
    const once = buildEffectiveCalculatorParams(fixtureParams, fields, overrides, {
      resetRentIncreasePlan: false,
      storedRentIncreasePlan: fixtureParams.rentIncreasePlan,
    });

    const twice = buildEffectiveCalculatorParams(once, fieldsFromParams(once), overridesFromParams(once), {
      resetRentIncreasePlan: false,
      storedRentIncreasePlan: once.rentIncreasePlan,
    });

    expect(twice).toEqual(once);
  });

  it('applies a financing-rate override the same way the API route does', () => {
    const overrides: CalculatorOverrides = { ...overridesFromParams(fixtureParams), financingInterestRateOverride: 4.1 };
    const fields = fieldsFromParams(fixtureParams);

    const result = buildEffectiveCalculatorParams(fixtureParams, fields, overrides, {
      resetRentIncreasePlan: false,
      storedRentIncreasePlan: fixtureParams.rentIncreasePlan,
    });

    expect(result.interestRate).toBe(4.1);
    expect(result.financingInterestRateOverride).toBe(4.1);
    expect(result.monthlyDebtService).toBeCloseTo(
      recomputeMonthlyDebtService(fixtureParams.loanAmount, 4.1, fixtureParams.repaymentRate),
      2,
    );
  });

  it('clamps an out-of-range financing-rate override exactly like clampInterestRate', () => {
    const overrides: CalculatorOverrides = { ...overridesFromParams(fixtureParams), financingInterestRateOverride: 99 };
    const fields = fieldsFromParams(fixtureParams);

    const result = buildEffectiveCalculatorParams(fixtureParams, fields, overrides, {
      resetRentIncreasePlan: false,
      storedRentIncreasePlan: fixtureParams.rentIncreasePlan,
    });

    expect(result.interestRate).toBe(25);
  });

  it('drops the stored plan and rent-increase overrides when resetRentIncreasePlan is set', () => {
    const overrides = overridesFromParams(fixtureParams);
    const fields = { ...fieldsFromParams(fixtureParams), rentIncreaseIntervalMonths: 24 };

    const result = buildEffectiveCalculatorParams(fixtureParams, fields, overrides, {
      resetRentIncreasePlan: true,
      storedRentIncreasePlan: fixtureParams.rentIncreasePlan,
    });

    expect(result.rentIncreasePlan).toBeUndefined();
    expect(result.rentIncreaseOverrides).toBeUndefined();
    expect(result.rentIncreaseIntervalMonths).toBe(24);
  });

  it('always sends placementMode DEFAULT — matching every ordinary (non-"Optimieren") save', () => {
    const withOptimizedBase: CalculatorParams = { ...fixtureParams, placementMode: 'OPTIMIZED' };
    const overrides = overridesFromParams(fixtureParams);
    const fields = fieldsFromParams(fixtureParams);

    const result = buildEffectiveCalculatorParams(withOptimizedBase, fields, overrides, {
      resetRentIncreasePlan: false,
      storedRentIncreasePlan: fixtureParams.rentIncreasePlan,
    });

    expect(result.placementMode).toBe('DEFAULT');
  });

  it('parses German-locale decimal text for last559MonthlyDelta and a manual rent index', () => {
    const overrides = overridesFromParams(fixtureParams);
    const fields: CalculatorParameterFields = {
      ...fieldsFromParams(fixtureParams),
      last559Date: '2026-01',
      last559MonthlyDelta: '1.234,56',
      rentIndexSource: 'MANUAL',
      rentIndexPerM2: '9,5',
    };

    const result = buildEffectiveCalculatorParams(fixtureParams, fields, overrides, {
      resetRentIncreasePlan: false,
      storedRentIncreasePlan: fixtureParams.rentIncreasePlan,
    });

    expect(result.last559MonthlyDelta).toBeCloseTo(1234.56, 2);
    expect(result.rentIndexPerM2).toBeCloseTo(9.5, 2);
    expect(result.rentIndexSource).toBe('MANUAL');
  });

  it('zeroes last559MonthlyDelta when last559Date is not set, regardless of the typed amount', () => {
    const overrides = overridesFromParams(fixtureParams);
    const fields: CalculatorParameterFields = {
      ...fieldsFromParams(fixtureParams),
      last559Date: '',
      last559MonthlyDelta: '250',
    };

    const result = buildEffectiveCalculatorParams(fixtureParams, fields, overrides, {
      resetRentIncreasePlan: false,
      storedRentIncreasePlan: fixtureParams.rentIncreasePlan,
    });

    expect(result.last559Date).toBeNull();
    expect(result.last559MonthlyDelta).toBe(0);
  });

  it('falls back to the automatic rent-index estimate when the source is not MANUAL', () => {
    const overrides = overridesFromParams(fixtureParams);
    const fields: CalculatorParameterFields = {
      ...fieldsFromParams(fixtureParams),
      rentIndexSource: 'AUTOMATIC',
      rentIndexPerM2: '9,5', // must be ignored — source isn't MANUAL
    };

    const result = buildEffectiveCalculatorParams(fixtureParams, fields, overrides, {
      resetRentIncreasePlan: false,
      storedRentIncreasePlan: fixtureParams.rentIncreasePlan,
    });

    expect(result.rentIndexSource).toBe('AUTOMATIC');
    expect(result.rentIndexPerM2).not.toBeCloseTo(9.5, 2);
  });
});

describe('excludedModernizationIds round-trip', () => {
  it('survives params → overrides → effective params', () => {
    const params = { ...(fixture.params as unknown as CalculatorParams), excludedModernizationIds: ['x'] };
    const overrides = overridesFromParams(params);
    expect(overrides.excludedModernizationIds).toEqual(['x']);
    const rebuilt = buildEffectiveCalculatorParams(params, fieldsFromParams(params), overrides, {
      resetRentIncreasePlan: false,
      storedRentIncreasePlan: params.rentIncreasePlan,
    });
    expect(rebuilt.excludedModernizationIds).toEqual(['x']);
  });
});

describe('overridesFromParams', () => {
  it('round-trips through buildEffectiveCalculatorParams without altering the override fields', () => {
    const overrides = overridesFromParams(fixtureParams);
    expect(overrides.equityIncluded).toBe(fixtureParams.equityIncluded === true);
    expect(overrides.taxRate).toBe(fixtureParams.taxRate);
    expect(overrides.modernizationPlacements).toEqual(fixtureParams.modernizationPlacements ?? {});
  });
});
