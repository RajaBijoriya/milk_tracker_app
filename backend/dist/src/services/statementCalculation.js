export function calculateDailyAmount(quantityMl, pricePerLitrePaise) {
    return Math.round((quantityMl * pricePerLitrePaise) / 1000);
}
