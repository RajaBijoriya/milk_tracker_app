import {calculateDailyAmount, calculateMonthlySummary} from '../src/services/milkCalculation';
import {MilkProfile, MilkEntry, PriceHistory, QuantityHistory} from '../src/types/milk.types';

const profile: MilkProfile = {
  id: 1,
  name: 'Daily Milk',
  defaultQuantityMl: 1000,
  pricePerLitrePaise: 7000,
  startDate: '2026-01-01',
  isActive: true,
  createdAt: '2026-01-01',
  updatedAt: '2026-01-01',
};
const entry = (date: string, quantityMl: number): MilkEntry => ({
  id: 1, milkProfileId: 1, entryDate: date, quantityMl, note: null,
  createdAt: date, updatedAt: date,
});

test('calculates a normal 30-day month', () => {
  const summary = calculateMonthlySummary('2026-09', profile, [], [], []);
  expect(summary.records).toHaveLength(30);
  expect(summary.totalQuantityMl).toBe(30000);
  expect(summary.totalAmountPaise).toBe(210000);
});

test('handles February and leap-year February', () => {
  expect(calculateMonthlySummary('2026-02', profile, [], [], []).records).toHaveLength(28);
  const leapProfile = {...profile, startDate: '2024-01-01'};
  expect(calculateMonthlySummary('2024-02', leapProfile, [], [], []).records).toHaveLength(29);
});

test('applies no milk, half litre, extra milk, and multiple exceptions', () => {
  const entries = [entry('2026-10-05', 0), entry('2026-10-12', 500), entry('2026-10-20', 2000)];
  const summary = calculateMonthlySummary('2026-10', profile, entries, [], []);
  expect(summary.skippedDays).toBe(1);
  expect(summary.modifiedDays).toBe(3);
  expect(summary.totalQuantityMl).toBe(30500);
  expect(summary.totalAmountPaise).toBe(213500);
});

test('applies effective price and quantity changes', () => {
  const prices: PriceHistory[] = [
    {id: 1, milkProfileId: 1, pricePerLitrePaise: 7000, effectiveDate: '2026-11-01', createdAt: ''},
    {id: 2, milkProfileId: 1, pricePerLitrePaise: 7500, effectiveDate: '2026-11-15', createdAt: ''},
  ];
  const quantities: QuantityHistory[] = [
    {id: 1, milkProfileId: 1, defaultQuantityMl: 1000, effectiveDate: '2026-11-01', createdAt: ''},
    {id: 2, milkProfileId: 1, defaultQuantityMl: 1500, effectiveDate: '2026-11-20', createdAt: ''},
  ];
  const summary = calculateMonthlySummary('2026-11', profile, [], prices, quantities);
  expect(summary.records[13].pricePerLitrePaise).toBe(7000);
  expect(summary.records[14].pricePerLitrePaise).toBe(7500);
  expect(summary.records[19].quantityMl).toBe(1500);
});

test('ignores dates before profile start and round currency correctly', () => {
  const lateProfile = {...profile, startDate: '2026-10-10'};
  const summary = calculateMonthlySummary('2026-10', lateProfile, [], [], []);
  expect(summary.records).toHaveLength(22);
  expect(calculateDailyAmount(250, 7001)).toBe(1750);
});
