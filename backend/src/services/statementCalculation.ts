export function calculateDailyAmount(quantityMl: number, pricePerLitrePaise: number): number {
  return Math.round((quantityMl * pricePerLitrePaise) / 1000);
}
