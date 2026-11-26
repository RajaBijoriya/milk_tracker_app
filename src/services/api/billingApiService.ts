import {apiRequest} from './apiClient';
import {MilkStatement} from './milkApiService';

export type PaymentStatus = 'paid' | 'unpaid' | 'partially_paid';
export type PaymentMethod = 'cash' | 'upi' | 'bank_transfer' | 'other';

export type BillingMonth = {
  month: string;
  totalQuantityMl: number;
  totalAmountPaise: number;
  amountPaidPaise: number;
  remainingAmountPaise: number;
  paymentStatus: PaymentStatus;
  billStatus: 'provisional' | 'finalized';
  readOnly: boolean;
};

export type BillingSummary = {
  month: string;
  currentMonth: string;
  billingStartMonth: string;
  currentMonthBillPaise: number;
  currentMonthPaidPaise: number;
  currentMonthRemainingPaise: number;
  previousOutstandingPaise: number;
  totalPayablePaise: number;
  totalBilledPaise: number;
  totalPaidPaise: number;
  totalOutstandingPaise: number;
  paidMonths: number;
  unpaidMonths: number;
  partiallyPaidMonths: number;
};

export type BillDetails = MilkStatement & BillingMonth & {
  bills: BillingMonth[];
  billingSummary: BillingSummary;
  previousOutstandingPaise: number;
  totalPayablePaise: number;
  paymentHistory: Array<{
    id: string;
    amountPaise: number;
    paymentAmountPaise: number;
    paymentDate: string;
    paymentMethod: PaymentMethod;
    note: string;
    idempotencyKey: string;
  }>;
};

export type PaymentRecord = {
  _id: string;
  amountPaise: number;
  paymentDate: string;
  paymentMethod: PaymentMethod;
  note: string;
  idempotencyKey: string;
  allocations: Array<{billMonth: string; amountPaise: number}>;
  createdAt: string;
};

export async function getBillingSummary(month?: string): Promise<BillingSummary> {
  const query = month ? `?month=${encodeURIComponent(month)}` : '';
  const result = await apiRequest<{summary: BillingSummary}>(`/milk/bills/summary${query}`);
  return result.summary;
}

export async function getBills(page = 1, limit = 24): Promise<{
  page: number;
  limit: number;
  total: number;
  bills: BillingMonth[];
}> {
  return apiRequest(`/milk/bills?page=${page}&limit=${limit}`);
}

export async function getBill(month: string): Promise<BillDetails> {
  const result = await apiRequest<{bill: BillDetails}>(`/milk/bills/${encodeURIComponent(month)}`);
  return result.bill;
}

export async function recordPayment(input: {
  amountPaise: number;
  paymentDate: string;
  paymentMethod: PaymentMethod;
  note: string;
  idempotencyKey: string;
  month?: string;
}): Promise<{payment: PaymentRecord; replayed: boolean}> {
  return apiRequest('/milk/payments', {method: 'POST', body: input});
}

export async function getPaymentHistory(month?: string, page = 1, limit = 24): Promise<{
  page: number;
  limit: number;
  total: number;
  payments: PaymentRecord[];
}> {
  const query = new URLSearchParams({page: String(page), limit: String(limit)});
  if (month) query.set('month', month);
  return apiRequest(`/milk/payments?${query.toString()}`);
}
