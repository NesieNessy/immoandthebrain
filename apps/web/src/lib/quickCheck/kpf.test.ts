import { describe, expect, it } from 'vitest';
import { calcKpf, calcPositionPct, classifyKpf, KPF_SCALE_MAX, KPF_SCALE_MIN } from './kpf';

describe('calcKpf', () => {
  it('computes purchase price / (cold rent × 12)', () => {
    expect(calcKpf(300000, 1000)).toBe(25);
  });

  it('rounds to 1 decimal place', () => {
    expect(calcKpf(305000, 1000)).toBe(25.4);
  });

  it('returns null for a non-positive purchase price', () => {
    expect(calcKpf(0, 1000)).toBeNull();
    expect(calcKpf(-1, 1000)).toBeNull();
  });

  it('returns null for a non-positive cold rent', () => {
    expect(calcKpf(300000, 0)).toBeNull();
    expect(calcKpf(300000, -1)).toBeNull();
  });
});

describe('calcPositionPct', () => {
  it('places a value in the middle of the range at 50%', () => {
    expect(calcPositionPct(22.5, 15, 30)).toBeCloseTo(50, 5);
  });

  it('clamps below the range to 0', () => {
    expect(calcPositionPct(0, 15, 30)).toBe(0);
  });

  it('clamps above the range to 100', () => {
    expect(calcPositionPct(100, 15, 30)).toBe(100);
  });

  it('lands exactly on the bounds at 0% and 100%', () => {
    expect(calcPositionPct(15, 15, 30)).toBe(0);
    expect(calcPositionPct(30, 15, 30)).toBe(100);
  });

  it('falls back to 50 for a degenerate (zero-width or inverted) range', () => {
    expect(calcPositionPct(20, 20, 20)).toBe(50);
    expect(calcPositionPct(20, 30, 15)).toBe(50);
  });

  it('matches the fixed KPF gauge scale used elsewhere in the app', () => {
    expect(calcPositionPct(KPF_SCALE_MIN, KPF_SCALE_MIN, KPF_SCALE_MAX)).toBe(0);
    expect(calcPositionPct(KPF_SCALE_MAX, KPF_SCALE_MIN, KPF_SCALE_MAX)).toBe(100);
  });
});

describe('classifyKpf', () => {
  it('labels anything below 20 as Günstig', () => {
    expect(classifyKpf(19.9).label).toBe('Günstig');
    expect(classifyKpf(0).label).toBe('Günstig');
  });

  it('labels 20–25 as Solide, inclusive of the lower bound', () => {
    expect(classifyKpf(20).label).toBe('Solide');
    expect(classifyKpf(24.9).label).toBe('Solide');
  });

  it('labels 25–30 as Hochpreisig, inclusive of the lower bound', () => {
    expect(classifyKpf(25).label).toBe('Hochpreisig');
    expect(classifyKpf(29.9).label).toBe('Hochpreisig');
  });

  it('labels 30 and above as Sehr teuer', () => {
    expect(classifyKpf(30).label).toBe('Sehr teuer');
    expect(classifyKpf(50).label).toBe('Sehr teuer');
  });

  it('embeds the value (1 decimal place) in the description', () => {
    expect(classifyKpf(25.36).description).toContain('25.4');
  });
});
