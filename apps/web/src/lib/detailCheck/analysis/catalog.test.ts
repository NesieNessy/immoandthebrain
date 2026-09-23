import { describe, expect, it } from 'vitest';
import { USE_CASES, isAvailable } from './catalog';

describe('use case catalog', () => {
  it('lists twelve unique use cases', () => {
    expect(USE_CASES).toHaveLength(12);
    expect(new Set(USE_CASES.map((item) => item.id)).size).toBe(12);
  });

  it('slice 1 enables exactly break-even, amortisation and wirtschaftlichkeit', () => {
    expect(USE_CASES.filter(isAvailable).map((item) => item.id)).toEqual(['break-even', 'amortisation', 'wirtschaftlichkeit']);
  });

  it('every use case carries a question for the tooltip', () => {
    for (const item of USE_CASES) expect(item.question.endsWith('?')).toBe(true);
  });
});
