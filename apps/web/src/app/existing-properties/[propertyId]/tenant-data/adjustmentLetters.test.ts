import { describe, expect, it } from 'vitest';
import {
  renovationAdjustmentLetterHtml,
  rentIncreaseLetterHtml,
  type RenovationAdjustmentLetterParams,
  type RentIncreaseLetterParams,
} from './adjustmentLetters';

const baseParty = {
  landlordName: 'Max Vermieter',
  landlordStreet: 'Landlordstraße 1',
  landlordCity: '80331 München',
  propertyAddress: 'Musterstraße 1, 80331 München',
  unitLabel: 'Whg. 2 (EG links)',
  tenantNames: ['Klaus Fischer'],
  issuePlace: 'München',
  issueDate: '01.03.2026',
};

describe('rentIncreaseLetterHtml', () => {
  const params: RentIncreaseLetterParams = {
    ...baseParty,
    currentColdRent: 1000,
    increaseAmount: 100,
    effectiveDate: '2026-06-01',
  };

  it('cites § 558 BGB and titles the document "Mieterhöhungsschreiben"', () => {
    const html = rentIncreaseLetterHtml(params);
    expect(html).toContain('§ 558 BGB');
    expect(html).toContain('<title>Mieterhöhungsschreiben</title>');
  });

  it('shows the current rent, the increase, and their sum as the new rent', () => {
    const html = rentIncreaseLetterHtml(params);
    expect(html).toContain('1.000 €');
    expect(html).toContain('100 €');
    expect(html).toContain('1.100 €');
  });

  it('formats the effective date German-style (dd.MM.yyyy)', () => {
    const html = rentIncreaseLetterHtml(params);
    expect(html).toContain('01.06.2026');
  });

  it('falls back to "–" for the current rent (and thus the new rent) when unknown', () => {
    const html = rentIncreaseLetterHtml({ ...params, currentColdRent: null });
    // New rent can't be computed without a starting value, so both old and new rent show '–'.
    expect((html.match(/–/g) ?? []).length).toBeGreaterThanOrEqual(2);
  });

  it('uses the singular salutation ("geehrter") for exactly one tenant', () => {
    const html = rentIncreaseLetterHtml({ ...params, tenantNames: ['Klaus Fischer'] });
    expect(html).toContain('Sehr geehrter Klaus Fischer,');
  });

  it('uses the plural salutation ("geehrte") and joins names with " / " for co-tenants', () => {
    const html = rentIncreaseLetterHtml({ ...params, tenantNames: ['Klaus Fischer', 'Erna Fischer'] });
    expect(html).toContain('Sehr geehrte Klaus Fischer / Erna Fischer,');
  });

  it('appends the unit label after the property address, separated by " · "', () => {
    const html = rentIncreaseLetterHtml(params);
    expect(html).toContain(`${params.propertyAddress} · ${params.unitLabel}`);
  });

  it('omits the separator entirely when there is no unit label (single-unit property)', () => {
    const html = rentIncreaseLetterHtml({ ...params, unitLabel: '' });
    expect(html).toContain(params.propertyAddress);
    expect(html).not.toContain(' · ');
  });

  it('signs off with the landlord name after the closing salutation', () => {
    const html = rentIncreaseLetterHtml(params);
    expect(html).toContain('Mit freundlichen Grüßen');
    expect(html.lastIndexOf(params.landlordName)).toBeGreaterThan(html.lastIndexOf('Mit freundlichen Grüßen'));
  });
});

describe('renovationAdjustmentLetterHtml', () => {
  const params: RenovationAdjustmentLetterParams = {
    ...baseParty,
    modernizationAmount: 75,
    startDate: '2026-01-10',
    endDate: '2026-03-20',
    effectiveDate: '2026-05-01',
  };

  it('cites §§ 555b and 559 BGB and titles the document "Sanierungsanpassungsschreiben"', () => {
    const html = renovationAdjustmentLetterHtml(params);
    expect(html).toContain('§ 555b BGB');
    expect(html).toContain('§ 559 BGB');
    expect(html).toContain('<title>Sanierungsanpassungsschreiben</title>');
  });

  it('formats the modernization start, end, and effective dates German-style', () => {
    const html = renovationAdjustmentLetterHtml(params);
    expect(html).toContain('10.01.2026');
    expect(html).toContain('20.03.2026');
    expect(html).toContain('01.05.2026');
  });

  it('shows the monthly increase amount', () => {
    const html = renovationAdjustmentLetterHtml(params);
    expect(html).toContain('75 €');
  });

  it('states the statutory rent-increase cap (3,00 € / 2,00 € per m²)', () => {
    const html = renovationAdjustmentLetterHtml(params);
    expect(html).toContain('3,00 €');
    expect(html).toContain('2,00 €');
  });

  it('falls back to "–" for missing start/end dates', () => {
    const html = renovationAdjustmentLetterHtml({ ...params, startDate: null, endDate: null });
    expect((html.match(/–/g) ?? []).length).toBeGreaterThanOrEqual(2);
  });

  it('uses the plural salutation for co-tenants, same as the rent-increase letter', () => {
    const html = renovationAdjustmentLetterHtml({ ...params, tenantNames: ['Klaus Fischer', 'Erna Fischer'] });
    expect(html).toContain('Sehr geehrte Klaus Fischer / Erna Fischer,');
  });
});
