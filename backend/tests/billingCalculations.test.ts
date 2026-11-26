import assert from 'node:assert/strict';
import {test} from 'node:test';
import {allocateOldestFirst, monthsBetween, paymentStatus} from '../src/services/billingCalculations.js';

test('enumerates billing months across year boundaries', () => {
  assert.deepEqual(monthsBetween('2026-12', '2027-02'), ['2026-12', '2027-01', '2027-02']);
  assert.deepEqual(monthsBetween('2027-02', '2026-12'), []);
});

test('classifies paid, unpaid, partial, and zero-value bills', () => {
  assert.equal(paymentStatus(2000, 0), 'unpaid');
  assert.equal(paymentStatus(2000, 500), 'partially_paid');
  assert.equal(paymentStatus(2000, 2000), 'paid');
  assert.equal(paymentStatus(0, 0), 'paid');
});

test('allocates consolidated payments to the oldest outstanding bill first', () => {
  assert.deepEqual(
    allocateOldestFirst([
      {month: '2026-10', remainingAmountPaise: 400},
      {month: '2026-11', remainingAmountPaise: 900},
    ], 700),
    {
      allocations: [
        {billMonth: '2026-10', amountPaise: 400},
        {billMonth: '2026-11', amountPaise: 300},
      ],
      remaining: 0,
    },
  );
});
