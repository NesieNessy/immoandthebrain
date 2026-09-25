import { describe, expect, it } from 'vitest';
import { OPTIMIZATION_GOAL, USE_CASES, isAvailable } from './catalog';

describe('use case catalog', () => {
  it('lists twelve unique use cases', () => {
    expect(USE_CASES).toHaveLength(12);
    expect(new Set(USE_CASES.map((item) => item.id)).size).toBe(12);
  });

  it('slices 1, 3 and 4 are available: three evaluations and all six optimizations, simulations still follow', () => {
    expect(USE_CASES.filter(isAvailable).map((item) => item.id)).toEqual([
      'break-even', 'amortisation', 'wirtschaftlichkeit',
      'optimaler-zeitpunkt', 'mieterhoehungsstrategie', 'cashflow-optimierung',
      'modernisierungsstrategie', 'kapitalrendite', 'empfehlung',
    ]);
  });

  it('every available optimization has a goal', () => {
    for (const item of USE_CASES.filter((useCase) => useCase.group === 'optimierung' && isAvailable(useCase))) {
      expect(OPTIMIZATION_GOAL[item.id]).toBeDefined();
    }
  });

  it('every use case carries a question for the tooltip', () => {
    for (const item of USE_CASES) expect(item.question.endsWith('?')).toBe(true);
  });
});
