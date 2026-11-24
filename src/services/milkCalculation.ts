import {DailyMilkRecord, MilkEntry, MilkProfile, PriceHistory, QuantityHistory} from '../types/milk.types';
import {fromDateKey, monthKey, toDateKey, todayKey} from '../utils/dateUtils';

export function getEffectivePrice(
  date: string,
  profile: MilkProfile,
  history: PriceHistory[],
): number {
  const eligible = history
    .filter(item => item.effectiveDate <= date)
    .sort((a, b) => b.effectiveDate.localeCompare(a.effectiveDate));
  return eligible[0]?.pricePerLitrePaise ?? profile.pricePerLitrePaise;
}

export function getEffectiveQuantity(
  date: string,
  profile: MilkProfile,
  history: QuantityHistory[],
): number {
  const eligible = history
    .filter(item => item.effectiveDate <= date)
    .sort((a, b) => b.effectiveDate.localeCompare(a.effectiveDate));
  return eligible[0]?.defaultQuantityMl ?? profile.defaultQuantityMl;
}

export function calculateDailyAmount(quantityMl: number, pricePerLitrePaise: number): number {
  return Math.round((quantityMl * pricePerLitrePaise) / 1000);
}

export function generateDailyRecords(
  month: string,
  profile: MilkProfile,
  entries: MilkEntry[],
  priceHistory: PriceHistory[],
  quantityHistory: QuantityHistory[],
  endDate?: string,
): DailyMilkRecord[] {
  const [year, monthNumber] = month.split('-').map(Number);
  const currentMonth = monthKey(new Date());
  if (month > currentMonth) return [];
  const lastDay = new Date(year, monthNumber, 0).getDate();
  const effectiveEnd = endDate && endDate.startsWith(month)
    ? Math.min(lastDay, Number(endDate.slice(-2)))
    : lastDay;
  const entryMap = new Map(entries.map(entry => [entry.entryDate, entry]));
  const records: DailyMilkRecord[] = [];

  for (let day = 1; day <= effectiveEnd; day++) {
    const date = `${month}-${String(day).padStart(2, '0')}`;
    if (date < profile.startDate) continue;
    const defaultQuantity = getEffectiveQuantity(date, profile, quantityHistory);
    const override = entryMap.get(date);
    const quantityMl = override?.quantityMl ?? defaultQuantity;
    const price = getEffectivePrice(date, profile, priceHistory);
    records.push({
      date,
      quantityMl,
      pricePerLitrePaise: price,
      amountPaise: calculateDailyAmount(quantityMl, price),
      isModified: Boolean(override),
      isSkipped: quantityMl === 0,
      note: override?.note ?? null,
    });
  }
  return records;
}

export function calculateMonthlySummary(
  month: string,
  profile: MilkProfile,
  entries: MilkEntry[],
  priceHistory: PriceHistory[],
  quantityHistory: QuantityHistory[],
): import('../types/milk.types').MonthlySummary {
  const currentMonth = monthKey(new Date());
  const isMonthToDate = month === currentMonth;
  const records = generateDailyRecords(
    month,
    profile,
    entries,
    priceHistory,
    quantityHistory,
    isMonthToDate ? todayKey() : undefined,
  );
  return {
    month,
    records,
    totalQuantityMl: records.reduce((sum, record) => sum + record.quantityMl, 0),
    totalAmountPaise: records.reduce((sum, record) => sum + record.amountPaise, 0),
    skippedDays: records.filter(record => record.isSkipped).length,
    modifiedDays: records.filter(record => record.isModified).length,
    isMonthToDate,
  };
}

export function formatLitres(quantityMl: number): string {
  const litres = quantityMl / 1000;
  return `${litres % 1 === 0 ? litres.toFixed(0) : litres.toFixed(2).replace(/0$/, '')} L`;
}

export function formatCurrency(paise: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 2,
  }).format(paise / 100);
}