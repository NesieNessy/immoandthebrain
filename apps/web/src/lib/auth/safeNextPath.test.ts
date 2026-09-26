import { describe, expect, it } from 'vitest';
import { safeNextPath } from './safeNextPath';

describe('safeNextPath', () => {
  it('returns to a same-site path, including its query', () => {
    expect(safeNextPath('/property-valuation/detail-check/renovation?workflowId=detail-check%3Aabc')).toBe(
      '/property-valuation/detail-check/renovation?workflowId=detail-check%3Aabc',
    );
  });

  it('falls back to the start page without a target', () => {
    expect(safeNextPath(null)).toBe('/');
    expect(safeNextPath('')).toBe('/');
  });

  it('never redirects off-site (open redirect)', () => {
    expect(safeNextPath('https://evil.example')).toBe('/');
    expect(safeNextPath('//evil.example')).toBe('/');
    expect(safeNextPath('/\\evil.example')).toBe('/');
    expect(safeNextPath('javascript:alert(1)')).toBe('/');
  });
});
