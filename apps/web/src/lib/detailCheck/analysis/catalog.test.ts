import { describe, expect, it } from 'vitest';
import { OPTIMIZATION_OBJECTIVE, USE_CASES, isAvailable } from './catalog';

describe('use case catalog', () => {
  it('lists twelve unique use cases', () => {
    expect(USE_CASES).toHaveLength(12);
    expect(new Set(USE_CASES.map((item) => item.id)).size).toBe(12);
  });

  it('slices 1 and 3 are available: three evaluations and three optimizations', () => {
    expect(USE_CASES.filter(isAvailable).map((item) => item.id)).toEqual([
      'break-even', 'amortisation', 'wirtschaftlichkeit',
      'optimaler-zeitpunkt', 'mieterhoehungsstrategie', 'cashflow-optimierung',
    ]);
  });

  it('every available optimization has an objective', () => {
    for (const item of USE_CASES.filter((useCase) => useCase.group === 'optimierung' && isAvailable(useCase))) {
      expect(OPTIMIZATION_OBJECTIVE[item.id]).toBeDefined();
    }
  });

  it('every use case carries a question for the tooltip', () => {
    for (const item of USE_CASES) expect(item.question.endsWith('?')).toBe(true);
  });
});
