import {getStartDateRange, isStartDateAllowed, subtractCalendarMonths} from '../src/utils/startDateRange';

describe('start date range', () => {
  it('allows the configured three-calendar-month window inclusively', () => {
    const range = getStartDateRange(new Date('2026-11-24T12:00:00.000Z'), 'Asia/Kolkata');
    expect(range).toEqual({min: '2026-08-24', max: '2026-11-24'});
    expect(isStartDateAllowed('2026-08-24', range)).toBe(true);
    expect(isStartDateAllowed('2026-08-23', range)).toBe(false);
    expect(isStartDateAllowed('2026-11-25', range)).toBe(false);
  });

  it('handles year boundaries and clamps end-of-month dates', () => {
    expect(subtractCalendarMonths('2026-01-31', 3)).toBe('2025-10-31');
    expect(subtractCalendarMonths('2026-05-31', 3)).toBe('2026-02-28');
    expect(subtractCalendarMonths('2024-05-31', 3)).toBe('2024-02-29');
  });
});
