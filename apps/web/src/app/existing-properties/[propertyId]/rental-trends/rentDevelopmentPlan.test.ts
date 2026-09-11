import { describe, expect, it } from 'vitest';
import { computeProposal558, computeProposal559, rolloverTargetDateIfDue, type Proposal558Input, type Proposal559Input } from './rentDevelopmentPlan';

const base558: Proposal558Input = {
    coldRent: 1000,
    livingAreaM2: 80,
    city: 'Bielefeld', // not in DENSE_MARKET_CITIES
    rentIndexPerM2: 12.5,
    rentIncreaseIntervalMonths: 12,
    lastIncreaseDate: null,
    priorIncreases: [],
    manualOverrideAmount: null,
};

const base559: Proposal559Input = {
    coldRent: 1000,
    livingAreaM2: 80,
    plannedRenovationCost: 15000,
    lastIncrease: null,
    manualOverrideAmount: null,
};

describe('computeProposal558', () => {
    it('uses 20% Kappungsgrenze outside dense markets', () => {
        const result = computeProposal558(base558);
        expect(result.denseMarket).toBe(false);
        expect(result.capPercent).toBe(0.2);
    });

    it('uses 15% Kappungsgrenze in a dense market', () => {
        const result = computeProposal558({ ...base558, city: 'München' });
        expect(result.denseMarket).toBe(true);
        expect(result.capPercent).toBe(0.15);
    });

    it('clamps the Sperrfrist to at least 15 months even when a shorter interval is entered', () => {
        const yesterday = new Date();
        yesterday.setMonth(yesterday.getMonth() - 10);
        const result = computeProposal558({
            ...base558,
            rentIncreaseIntervalMonths: 6, // below the legal 15-month floor
            lastIncreaseDate: yesterday.toISOString().slice(0, 10),
        });
        // Only 10 months have passed since the last increase — even the
        // requested 6-month interval would allow it, but the legal 15-month
        // floor pushes the earliest date out further than "10 months ago + 6".
        const earliest = new Date(result.earliestEffectiveDate);
        const monthsFromLast = (earliest.getFullYear() - yesterday.getFullYear()) * 12 + (earliest.getMonth() - yesterday.getMonth());
        expect(monthsFromLast).toBe(15);
    });

    it('caps the legal max at the Kappungsgrenze percentage of current rent when no comparison-rent target is set', () => {
        const result = computeProposal558({ ...base558, rentIndexPerM2: null });
        // 20% of 1000 = 200
        expect(result.legalMaxAmount).toBe(200);
    });

    it('further caps the legal max at the comparison-rent target when it is lower than the Kappungsgrenze', () => {
        // target = 12.5 * 80 = 1000 -> target - coldRent = 0, below the 200 Kappungsgrenze room
        const result = computeProposal558(base558);
        expect(result.legalMaxAmount).toBe(0);
    });

    it('reduces the Kappungsgrenze room by increases already used within the rolling 3-year window', () => {
        const today = new Date().toISOString().slice(0, 10);
        const result = computeProposal558({
            ...base558,
            rentIndexPerM2: 20, // high enough that the target isn't the binding constraint
            priorIncreases: [{ effectiveDate: today, amount: 150 }],
        });
        // room = (1000 - 150) * 0.2 - 150 = 170 - 150 = 20
        expect(result.legalMaxAmount).toBe(20);
    });

    it('ignores increases outside the rolling 3-year window', () => {
        const fourYearsAgo = new Date();
        fourYearsAgo.setFullYear(fourYearsAgo.getFullYear() - 4);
        const result = computeProposal558({
            ...base558,
            rentIndexPerM2: 20,
            priorIncreases: [{ effectiveDate: fourYearsAgo.toISOString().slice(0, 10), amount: 150 }],
        });
        // room = 1000 * 0.2 = 200 (old increase falls outside the window)
        expect(result.legalMaxAmount).toBe(200);
    });

    it('uses the manual override as the proposed amount instead of the legal max', () => {
        const result = computeProposal558({ ...base558, rentIndexPerM2: 20, manualOverrideAmount: 50 });
        expect(result.proposedAmount).toBe(50);
        expect(result.legalMaxAmount).toBe(200);
        expect(result.exceedsLegalMax).toBe(false);
    });

    it('flags a manual override that exceeds the legal max', () => {
        const result = computeProposal558({ ...base558, rentIndexPerM2: 20, manualOverrideAmount: 250 });
        expect(result.exceedsLegalMax).toBe(true);
    });
});

describe('computeProposal559', () => {
    it('uses a 3€/m² cap when the current rent is at or above 7€/m²', () => {
        // 1000 / 80 = 12.50 €/m²
        const result = computeProposal559(base559);
        expect(result.capPerM2).toBe(3);
        expect(result.capAbsOver6Years).toBe(240); // 3 * 80
    });

    it('uses a 2€/m² cap when the current rent is below 7€/m²', () => {
        const result = computeProposal559({ ...base559, coldRent: 400 }); // 5 €/m²
        expect(result.capPerM2).toBe(2);
        expect(result.capAbsOver6Years).toBe(160); // 2 * 80
    });

    it('recommends 8% of the planned renovation cost per year, spread monthly', () => {
        const result = computeProposal559(base559);
        // 0.08 * 15000 / 12 = 100
        expect(result.recommendedAmount).toBe(100);
    });

    it('caps the recommendation at the remaining 6-year €/m² room when the 8% figure would exceed it', () => {
        const result = computeProposal559({ ...base559, plannedRenovationCost: 60000 });
        // 8% figure = 400/mo, but the 6-year cap room is only 240
        expect(result.recommendedAmount).toBe(240);
    });

    it('reduces remaining room by a prior §559 increase still within the trailing 72 months', () => {
        const today = new Date().toISOString().slice(0, 10);
        const result = computeProposal559({ ...base559, lastIncrease: { effectiveDate: today, monthlyAmount: 200 } });
        // remainingRoom = 240 - 200 = 40
        expect(result.remainingRoom).toBe(40);
        expect(result.recommendedAmount).toBe(40); // 8% figure (100) is capped by the 40 remaining
    });

    it('ignores a prior §559 increase older than 72 months', () => {
        const sevenYearsAgo = new Date();
        sevenYearsAgo.setFullYear(sevenYearsAgo.getFullYear() - 7);
        const result = computeProposal559({
            ...base559,
            lastIncrease: { effectiveDate: sevenYearsAgo.toISOString().slice(0, 10), monthlyAmount: 200 },
        });
        expect(result.remainingRoom).toBe(240);
    });

    it('flags a manual override that exceeds the recommended legal max', () => {
        const result = computeProposal559({ ...base559, manualOverrideAmount: 180 });
        expect(result.recommendedAmount).toBe(100);
        expect(result.exceedsLegalMax).toBe(true);
    });

    it('does not flag a manual override at or below the recommended amount', () => {
        const result = computeProposal559({ ...base559, manualOverrideAmount: 80 });
        expect(result.exceedsLegalMax).toBe(false);
    });
});

describe('rolloverTargetDateIfDue', () => {
    it('returns null when the target date is still in the future', () => {
        const future = new Date();
        future.setMonth(future.getMonth() + 2);
        expect(rolloverTargetDateIfDue(future.toISOString().slice(0, 10))).toBeNull();
    });

    it('carries the date forward by one month when it has already passed', () => {
        const result = rolloverTargetDateIfDue('2026-01-15', new Date('2026-02-01'));
        expect(result).toBe('2026-02-15');
    });

    it('keeps carrying forward one month at a time even if several months have passed', () => {
        // A single call only advances one month — the caller re-checks on
        // next load, which is enough since this only runs lazily on view.
        const result = rolloverTargetDateIfDue('2026-01-15', new Date('2026-06-01'));
        expect(result).toBe('2026-02-15');
    });
});
