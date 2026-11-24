export function dateKeyInTimezone(date: Date, timezone: string): string {
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
  if (!year || !month || !day) throw new Error('Unable to resolve the current date for this timezone.');
  return `${year}-${month}-${day}`;
}

export function canEditDateInWindow(date: string, currentDate: Date, timezone: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const [yearText, monthText, dayText] = date.split('-');
  const parsed = new Date(Date.UTC(Number(yearText), Number(monthText) - 1, Number(dayText)));
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) return false;
  const today = dateKeyInTimezone(currentDate, timezone);
  if (date > today) return false;
  const currentParts = new Intl.DateTimeFormat('en-CA', {timeZone: timezone, year: 'numeric', month: '2-digit'}).formatToParts(currentDate);
  const currentYear = Number(currentParts.find(part => part.type === 'year')?.value);
  const currentMonth = Number(currentParts.find(part => part.type === 'month')?.value);
  const targetYear = Number(yearText);
  const targetMonth = Number(monthText);
  const difference = (currentYear - targetYear) * 12 + currentMonth - targetMonth;
  return difference >= 0 && difference <= 2;
}

export function currentMonthInTimezone(date: Date, timezone: string): string {
  return dateKeyInTimezone(date, timezone).slice(0, 7);
}
