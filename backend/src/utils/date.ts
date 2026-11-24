const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

export function isValidDateKey(value: string): boolean {
  const match = DATE_PATTERN.exec(value);
  if (!match) return false;
  const [, year, month, day] = match;
  const parsed = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  return parsed.toISOString().slice(0, 10) === value;
}

export function isValidMonthKey(value: string): boolean {
  return MONTH_PATTERN.test(value);
}

export function monthKeyAt(date: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(date);
  const year = parts.find(part => part.type === 'year')?.value;
  const month = parts.find(part => part.type === 'month')?.value;
  if (!year || !month) throw new Error('Unable to resolve calendar month for timezone');
  return `${year}-${month}`;
}

export function dateKeyAt(date: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const get = (type: 'year' | 'month' | 'day') => parts.find(part => part.type === type)?.value;
  const year = get('year');
  const month = get('month');
  const day = get('day');
  if (!year || !month || !day) throw new Error('Unable to resolve calendar date for timezone');
  return `${year}-${month}-${day}`;
}

export function subtractCalendarMonths(date: string, monthsToSubtract: number): string {
  if (!isValidDateKey(date) || !Number.isInteger(monthsToSubtract) || monthsToSubtract < 0) {
    throw new Error('A valid date and non-negative calendar-month count are required.');
  }
  const [year, month, day] = date.split('-').map(Number);
  const absoluteMonth = year * 12 + month - 1 - monthsToSubtract;
  const targetYear = Math.floor(absoluteMonth / 12);
  const targetMonth = (absoluteMonth % 12) + 1;
  const lastDay = new Date(Date.UTC(targetYear, targetMonth, 0)).getUTCDate();
  return `${String(targetYear).padStart(4, '0')}-${String(targetMonth).padStart(2, '0')}-${String(Math.min(day, lastDay)).padStart(2, '0')}`;
}

export function startDateRangeAt(date: Date, timezone: string): {min: string; max: string} {
  const max = dateKeyAt(date, timezone);
  return {min: subtractCalendarMonths(max, 3), max};
}

export function isStartDateInAllowedRange(date: string, now: Date, timezone: string): boolean {
  if (!isValidDateKey(date)) return false;
  const range = startDateRangeAt(now, timezone);
  return date >= range.min && date <= range.max;
}

export function canEditMilkDate(date: string, currentDate: Date, timezone: string): boolean {
  if (!isValidDateKey(date) || !Number.isFinite(currentDate.getTime())) return false;
  const today = dateKeyAt(currentDate, timezone);
  if (date > today) return false;
  const currentMonth = monthKeyAt(currentDate, timezone);
  const [currentYear, currentMonthNumber] = currentMonth.split('-').map(Number);
  const [targetYear, targetMonthNumber] = date.slice(0, 7).split('-').map(Number);
  const monthDifference = (currentYear - targetYear) * 12 + currentMonthNumber - targetMonthNumber;
  return monthDifference >= 0 && monthDifference <= 2;
}
