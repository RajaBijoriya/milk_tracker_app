import {MilkEntry, MilkProfile, MonthlySummary, PriceHistory, QuantityHistory} from '../types/milk.types';
import {calculateMonthlySummary} from './milkCalculation';

export function getMonthlySummary(
  month: string,
  profile: MilkProfile,
  entries: MilkEntry[],
  priceHistory: PriceHistory[],
  quantityHistory: QuantityHistory[],
): MonthlySummary {
  return calculateMonthlySummary(month, profile, entries, priceHistory, quantityHistory);
}