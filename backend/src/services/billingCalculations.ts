type OutstandingBill = {
  month: string;
  remainingAmountPaise: number;
};

export function monthsBetween(first: string, last: string): string[] {
  const monthPattern = /^\d{4}-(0[1-9]|1[0-2])$/;
  if (!monthPattern.test(first) || !monthPattern.test(last) || first > last) return [];
  const [firstYear, firstMonth] = first.split('-').map(Number);
  const [lastYear, lastMonth] = last.split('-').map(Number);
  const months: string[] = [];
  let year = firstYear;
  let month = firstMonth;
  while (year < lastYear || (year === lastYear && month <= lastMonth)) {
    months.push(`${year}-${String(month).padStart(2, '0')}`);
    month += 1;
    if (month === 13) {
      year += 1;
      month = 1;
    }
  }
  return months;
}

export function paymentStatus(
  totalAmountPaise: number,
  amountPaidPaise: number,
): 'paid' | 'unpaid' | 'partially_paid' {
  if (totalAmountPaise === 0 || amountPaidPaise >= totalAmountPaise) return 'paid';
  return amountPaidPaise > 0 ? 'partially_paid' : 'unpaid';
}

export function allocateOldestFirst(bills: OutstandingBill[], amountPaise: number) {
  let remaining = amountPaise;
  const allocations: Array<{billMonth: string; amountPaise: number}> = [];
  for (const bill of bills) {
    if (remaining === 0) break;
    const amount = Math.min(remaining, bill.remainingAmountPaise);
    if (amount > 0) allocations.push({billMonth: bill.month, amountPaise: amount});
    remaining -= amount;
  }
  return {allocations, remaining};
}
