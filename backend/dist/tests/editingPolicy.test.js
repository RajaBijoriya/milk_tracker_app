import assert from 'node:assert/strict';
import test from 'node:test';
import { canEditMilkDate, dateKeyAt, isStartDateInAllowedRange, monthKeyAt, startDateRangeAt, subtractCalendarMonths, } from '../src/utils/date.js';
test('allows dates in the current month and the previous two calendar months', () => {
    const now = new Date('2026-11-23T12:00:00.000Z');
    assert.equal(canEditMilkDate('2026-11-01', now, 'Asia/Kolkata'), true);
    assert.equal(canEditMilkDate('2026-10-31', now, 'Asia/Kolkata'), true);
    assert.equal(canEditMilkDate('2026-09-01', now, 'Asia/Kolkata'), true);
    assert.equal(canEditMilkDate('2026-08-31', now, 'Asia/Kolkata'), false);
});
test('rejects future dates and malformed calendar dates', () => {
    const now = new Date('2026-11-23T12:00:00.000Z');
    assert.equal(canEditMilkDate('2026-11-24', now, 'Asia/Kolkata'), false);
    assert.equal(canEditMilkDate('2026-02-29', now, 'Asia/Kolkata'), false);
    assert.equal(canEditMilkDate('2026-13-01', now, 'Asia/Kolkata'), false);
});
test('calculates the calendar day and month using the configured timezone', () => {
    const beforeKolkataMidnight = new Date('2026-11-22T18:29:00.000Z');
    assert.equal(dateKeyAt(beforeKolkataMidnight, 'Asia/Kolkata'), '2026-11-22');
    assert.equal(monthKeyAt(beforeKolkataMidnight, 'Asia/Kolkata'), '2026-11');
    assert.equal(canEditMilkDate('2026-11-22', new Date('2026-11-22T18:31:00.000Z'), 'Asia/Kolkata'), true);
});
test('uses a separate inclusive three-calendar-month start-date range', () => {
    const now = new Date('2026-11-24T12:00:00.000Z');
    assert.deepEqual(startDateRangeAt(now, 'Asia/Kolkata'), { min: '2026-08-24', max: '2026-11-24' });
    assert.equal(isStartDateInAllowedRange('2026-08-24', now, 'Asia/Kolkata'), true);
    assert.equal(isStartDateInAllowedRange('2026-08-23', now, 'Asia/Kolkata'), false);
    assert.equal(isStartDateInAllowedRange('2026-11-25', now, 'Asia/Kolkata'), false);
});
test('subtracts calendar months across years and clamps month ends', () => {
    assert.equal(subtractCalendarMonths('2026-01-31', 3), '2025-10-31');
    assert.equal(subtractCalendarMonths('2026-05-31', 3), '2026-02-28');
    assert.equal(subtractCalendarMonths('2024-05-31', 3), '2024-02-29');
});
