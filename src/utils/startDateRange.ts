import {dateKeyInTimezone} from './editWindow';

export type StartDateRange = {min: string; max: string};

export function subtractCalendarMonths(date: string, monthsToSubtract: number): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isInteger(monthsToSubtract) || monthsToSubtract < 0) {
    throw new Error('A valid date and non-negative calendar-month count are required.');
  }
  const [year, month, day] = date.split('-').map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (parsed.toISOString().slice(0, 10) !== date) {
    throw new Error('A valid date and non-negative calendar-month count are required.');
  }
  const absoluteMonth = year * 12 + month - 1 - monthsToSubtract;
  const targetYear = Math.floor(absoluteMonth / 12);
  const targetMonth = (absoluteMonth % 12) + 1;
  const lastDay = new Date(Date.UTC(targetYear, targetMonth, 0)).getUTCDate();
  return `${String(targetYear).padStart(4, '0')}-${String(targetMonth).padStart(2, '0')}-${String(Math.min(day, lastDay)).padStart(2, '0')}`;
}

export function getStartDateRange(now: Date, timezone: string): StartDateRange {
  const max = dateKeyInTimezone(now, timezone);
  return {min: subtractCalendarMonths(max, 3), max};
}

export function isStartDateAllowed(date: string, range: StartDateRange): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(date) && date >= range.min && date <= range.max;
}
