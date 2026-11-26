import {createHash} from 'node:crypto';
import mongoose, {Types} from 'mongoose';
import {LegacyImport, MilkEntry, MilkPayment, MilkProfile, MonthlyBill, PriceHistory, QuantityHistory, User} from '../models/index.js';
import type {ClientSession} from 'mongoose';
import type {MilkPaymentRecord, PaymentMethod} from '../models/MilkPayment.js';
import {
  canEditMilkDate,
  dateKeyAt,
  isStartDateInAllowedRange,
  isValidDateKey,
  isValidMonthKey,
  monthKeyAt,
} from '../utils/date.js';
import {HttpError} from '../utils/errors.js';
import {allocateOldestFirst, monthsBetween, paymentStatus} from './billingCalculations.js';
import {calculateDailyAmount} from './statementCalculation.js';

type ProfileInput = {
  name: string;
  defaultQuantityMl: number;
  pricePerLitrePaise: number;
  startDate: string;
};

type ImportEntryInput = {entryDate: string; quantityMl: number; note?: string};
type ImportInput = {
  profile: ProfileInput;
  priceHistory: Array<{pricePerLitrePaise: number; effectiveDate: string}>;
  quantityHistory: Array<{defaultQuantityMl: number; effectiveDate: string}>;
  entries: ImportEntryInput[];
};

type DailyRecord = {
  date: string;
  quantityMl: number;
  pricePerLitrePaise: number;
  amountPaise: number;
  isModified: boolean;
  isSkipped: boolean;
  note: string;
  version: number | null;
};

type StatementResult = {
  month: string;
  totalQuantityMl: number;
  totalAmountPaise: number;
  skippedDays: number;
  modifiedDays: number;
  status: 'provisional' | 'finalized';
  readOnly: boolean;
  records: DailyRecord[];
};

type PaymentInput = {
  amountPaise: number;
  paymentDate: string;
  paymentMethod: PaymentMethod;
  note: string;
  idempotencyKey: string;
  month?: string;
};

type BillingMonth = {
  month: string;
  totalQuantityMl: number;
  totalAmountPaise: number;
  amountPaidPaise: number;
  remainingAmountPaise: number;
  paymentStatus: 'paid' | 'unpaid' | 'partially_paid';
  billStatus: 'provisional' | 'finalized';
  readOnly: boolean;
};

type BillingDataset = {
  profile: Awaited<ReturnType<typeof findOwnedProfile>>;
  user: Awaited<ReturnType<typeof findUser>>;
  bills: BillingMonth[];
};

async function findUser(userId: string, session?: ClientSession) {
  let query = User.findById(userId);
  if (session) query = query.session(session);
  const user = await query;
  if (!user) throw new HttpError(401, 'SESSION_INVALID', 'Sign in again to continue.');
  return user;
}

async function findOwnedProfile(userId: string, profileId?: string, session?: ClientSession) {
  const query = profileId
    ? {_id: profileId, userId}
    : {userId, isActive: true};
  let profileQuery = MilkProfile.findOne(query);
  if (session) profileQuery = profileQuery.session(session);
  const profile = await profileQuery;
  if (!profile) throw new HttpError(404, 'PROFILE_NOT_FOUND', 'No milk profile was found for this account.');
  return profile;
}

function monthIsReadOnly(month: string, currentDate: Date, timezone: string): boolean {
  return !canEditMilkDate(`${month}-01`, currentDate, timezone);
}

async function assertEditableDate(userId: string, profileId: Types.ObjectId | string, date: string) {
  const user = await findUser(userId);
  if (!isValidDateKey(date) || !canEditMilkDate(date, new Date(), user.timezone)) {
    throw new HttpError(403, 'EDIT_WINDOW_EXPIRED', 'This month is read-only. You can edit the current month and the previous two months only.');
  }
  const finalized = await MonthlyBill.exists({
    userId,
    milkProfileId: profileId,
    billMonth: date.slice(0, 7),
    status: 'finalized',
  });
  if (finalized) {
    throw new HttpError(403, 'BILL_FINALIZED', 'This statement has been finalized and is read-only.');
  }
  return user;
}

export async function listProfiles(userId: string) {
  const profiles = await MilkProfile.find({userId}).sort({isActive: -1, createdAt: 1});
  const data = await Promise.all(profiles.map(async profile => ({
    id: profile.id,
    name: profile.name,
    defaultQuantityMl: profile.defaultQuantityMl,
    pricePerLitrePaise: profile.pricePerLitrePaise,
    startDate: profile.startDate,
    isActive: profile.isActive,
    createdAt: profile.createdAt,
    updatedAt: profile.updatedAt,
    priceHistory: await PriceHistory.find({userId, milkProfileId: profile.id}).sort({effectiveDate: 1}).lean(),
    quantityHistory: await QuantityHistory.find({userId, milkProfileId: profile.id}).sort({effectiveDate: 1}).lean(),
  })));
  return data;
}

export async function getProfile(userId: string, profileId: string) {
  const profile = await findOwnedProfile(userId, profileId);
  const [priceHistory, quantityHistory] = await Promise.all([
    PriceHistory.find({userId, milkProfileId: profile.id}).sort({effectiveDate: 1}).lean(),
    QuantityHistory.find({userId, milkProfileId: profile.id}).sort({effectiveDate: 1}).lean(),
  ]);
  return {
    id: profile.id,
    name: profile.name,
    defaultQuantityMl: profile.defaultQuantityMl,
    pricePerLitrePaise: profile.pricePerLitrePaise,
    startDate: profile.startDate,
    isActive: profile.isActive,
    createdAt: profile.createdAt,
    updatedAt: profile.updatedAt,
    priceHistory,
    quantityHistory,
  };
}

export async function createProfile(userId: string, input: ProfileInput) {
  const user = await findUser(userId);
  if (!isStartDateInAllowedRange(input.startDate, new Date(), user.timezone)) {
    throw new HttpError(422, 'START_DATE_OUT_OF_RANGE', 'Choose a tracking start date from the earliest allowed date through today.');
  }
  if (await MilkProfile.exists({userId, isActive: true})) {
    throw new HttpError(409, 'ACTIVE_PROFILE_EXISTS', 'This account already has an active milk profile.');
  }
  const transaction = await mongoose.startSession();
  let created: Awaited<ReturnType<typeof MilkProfile.create>>[number] | undefined;
  try {
    await transaction.withTransaction(async () => {
      const [profile] = await MilkProfile.create([{
        userId,
        ...input,
        isActive: true,
      }], {session: transaction});
      created = profile;
      await PriceHistory.create([{
        userId,
        milkProfileId: profile.id,
        pricePerLitrePaise: input.pricePerLitrePaise,
        effectiveDate: input.startDate,
      }], {session: transaction});
      await QuantityHistory.create([{
        userId,
        milkProfileId: profile.id,
        defaultQuantityMl: input.defaultQuantityMl,
        effectiveDate: input.startDate,
      }], {session: transaction});
    });
  } finally {
    await transaction.endSession();
  }
  if (!created) throw new HttpError(500, 'PROFILE_CREATE_FAILED', 'Unable to create the milk profile.');
  return getProfile(userId, created.id);
}

export async function updateProfile(
  userId: string,
  profileId: string,
  patch: {
    name?: string;
    defaultQuantityMl?: number;
    pricePerLitrePaise?: number;
    startDate?: string;
    expectedStartDate?: string;
    quantityEffectiveDate?: string;
    priceEffectiveDate?: string;
  },
) {
  const profile = await findOwnedProfile(userId, profileId);
  const startDateChanged = patch.startDate !== undefined && patch.startDate !== profile.startDate;
  const user = startDateChanged ? await findUser(userId) : null;
  if (startDateChanged) {
    if (patch.expectedStartDate !== profile.startDate) {
      throw new HttpError(409, 'PROFILE_START_DATE_CONFLICT', 'The tracking start date changed on another device. Refresh the profile and try again.');
    }
    if (!isStartDateInAllowedRange(patch.startDate!, new Date(), user!.timezone)) {
      throw new HttpError(422, 'START_DATE_OUT_OF_RANGE', 'Choose a tracking start date from the earliest allowed date through today.');
    }
    const firstAffectedMonth = [patch.startDate!, profile.startDate].sort()[0].slice(0, 7);
    const lastAffectedMonth = [patch.startDate!, profile.startDate].sort()[1].slice(0, 7);
    const finalized = await MonthlyBill.findOne({
      userId,
      milkProfileId: profile._id,
      status: 'finalized',
      billMonth: {$gte: firstAffectedMonth, $lte: lastAffectedMonth},
    }).select('billMonth').lean();
    if (finalized) {
      throw new HttpError(
        409,
        'FINALIZED_BILL_CONFLICT',
        `The start date cannot change because ${finalized.billMonth} has a finalized bill. Finalized bill snapshots are preserved.`,
      );
    }
  }
  const quantityChanged = patch.defaultQuantityMl !== undefined;
  const priceChanged = patch.pricePerLitrePaise !== undefined;
  const editUser = quantityChanged || priceChanged ? await findUser(userId) : user;
  const effectiveToday = editUser ? dateKeyAt(new Date(), editUser.timezone) : undefined;
  const quantityDate = patch.quantityEffectiveDate ?? effectiveToday ?? '';
  const priceDate = patch.priceEffectiveDate ?? effectiveToday ?? '';
  if (quantityChanged) await assertEditableDate(userId, profile.id, quantityDate);
  if (priceChanged) await assertEditableDate(userId, profile.id, priceDate);
  if (quantityChanged || priceChanged) {
    await assertProfileChangePreservesPayments(userId, profile, patch, quantityDate, priceDate);
  }

  const transaction = await mongoose.startSession();
  try {
    await transaction.withTransaction(async () => {
      if (patch.name !== undefined) profile.name = patch.name;
      if (startDateChanged) {
        const earliestPrice = await PriceHistory.findOne({userId, milkProfileId: profile._id})
          .sort({effectiveDate: 1}).session(transaction);
        const earliestQuantity = await QuantityHistory.findOne({userId, milkProfileId: profile._id})
          .sort({effectiveDate: 1}).session(transaction);
        if (!earliestPrice || earliestPrice.effectiveDate > patch.startDate!) {
          await PriceHistory.updateOne(
            {userId, milkProfileId: profile._id, effectiveDate: patch.startDate},
            {$setOnInsert: {
              userId,
              milkProfileId: profile._id,
              effectiveDate: patch.startDate,
              pricePerLitrePaise: earliestPrice?.pricePerLitrePaise ?? profile.pricePerLitrePaise,
            }},
            {upsert: true, session: transaction},
          );
        }
        if (!earliestQuantity || earliestQuantity.effectiveDate > patch.startDate!) {
          await QuantityHistory.updateOne(
            {userId, milkProfileId: profile._id, effectiveDate: patch.startDate},
            {$setOnInsert: {
              userId,
              milkProfileId: profile._id,
              effectiveDate: patch.startDate,
              defaultQuantityMl: earliestQuantity?.defaultQuantityMl ?? profile.defaultQuantityMl,
            }},
            {upsert: true, session: transaction},
          );
        }
        profile.startDate = patch.startDate!;
      }
      if (quantityChanged) profile.defaultQuantityMl = patch.defaultQuantityMl!;
      if (priceChanged) profile.pricePerLitrePaise = patch.pricePerLitrePaise!;
      await profile.save({session: transaction});

      if (quantityChanged) {
        await QuantityHistory.findOneAndUpdate(
          {userId, milkProfileId: profile.id, effectiveDate: quantityDate},
          {$set: {defaultQuantityMl: patch.defaultQuantityMl}},
          {upsert: true, returnDocument: 'after', setDefaultsOnInsert: true, session: transaction},
        );
      }
      if (priceChanged) {
        await PriceHistory.findOneAndUpdate(
          {userId, milkProfileId: profile.id, effectiveDate: priceDate},
          {$set: {pricePerLitrePaise: patch.pricePerLitrePaise}},
          {upsert: true, returnDocument: 'after', setDefaultsOnInsert: true, session: transaction},
        );
      }
    });
  } catch (error) {
    if (error instanceof Error && error.name === 'VersionError') {
      throw new HttpError(409, 'PROFILE_VERSION_CONFLICT', 'The milk profile changed on another device. Refresh it and try again.');
    }
    throw error;
  } finally {
    await transaction.endSession();
  }
  return getProfile(userId, profileId);
}

export async function listEntries(userId: string, month: string) {
  const profile = await findOwnedProfile(userId);
  return MilkEntry.find({
    userId,
    milkProfileId: profile.id,
    entryDate: {$gte: `${month}-01`, $lte: `${month}-31`},
  }).sort({entryDate: 1}).lean();
}

export async function upsertEntry(
  userId: string,
  date: string,
  input: {quantityMl: number; note?: string; version: number},
) {
  const profile = await findOwnedProfile(userId);
  await assertEditableDate(userId, profile.id, date);
  const existing = await MilkEntry.findOne({userId, milkProfileId: profile.id, entryDate: date});
  if ((!existing && input.version !== 0) || (existing && existing.version !== input.version)) {
    throw new HttpError(409, 'VERSION_CONFLICT', 'This entry changed on another device. Refresh and try again.');
  }
  const month = date.slice(0, 7);
  const statement = await getStatement(userId, month);
  const currentRecord = statement.records.find(record => record.date === date);
  if (currentRecord) {
    const updatedTotal = statement.totalAmountPaise - currentRecord.amountPaise +
      calculateDailyAmount(input.quantityMl, currentRecord.pricePerLitrePaise);
    await assertBillAmountCoversPayments(userId, profile.id, month, updatedTotal);
  }
  if (!existing) {
    try {
      return await MilkEntry.create({
        userId,
        milkProfileId: profile.id,
        entryDate: date,
        quantityMl: input.quantityMl,
        note: input.note ?? '',
        version: 1,
        isLegacyImported: false,
      });
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 11000) {
        throw new HttpError(409, 'VERSION_CONFLICT', 'This entry changed on another device. Refresh and try again.');
      }
      throw error;
    }
  }
  const updated = await MilkEntry.findOneAndUpdate(
    {_id: existing.id, userId, version: input.version},
    {$set: {quantityMl: input.quantityMl, note: input.note ?? ''}, $inc: {version: 1}},
    {returnDocument: 'after', runValidators: true},
  );
  if (!updated) throw new HttpError(409, 'VERSION_CONFLICT', 'This entry changed on another device. Refresh and try again.');
  return updated;
}

export async function deleteEntry(userId: string, date: string, version: number) {
  const profile = await findOwnedProfile(userId);
  await assertEditableDate(userId, profile.id, date);
  const existing = await MilkEntry.findOne({userId, milkProfileId: profile.id, entryDate: date});
  if (existing && existing.version === version) {
    const statement = await getStatement(userId, date.slice(0, 7));
    const currentRecord = statement.records.find(record => record.date === date);
    if (currentRecord) {
      const defaultQuantity = await QuantityHistory.findOne({
        userId, milkProfileId: profile.id, effectiveDate: {$lte: date},
      }).sort({effectiveDate: -1}).lean();
      const nextQuantity = defaultQuantity?.defaultQuantityMl ?? profile.defaultQuantityMl;
      const updatedTotal = statement.totalAmountPaise - currentRecord.amountPaise +
        calculateDailyAmount(nextQuantity, currentRecord.pricePerLitrePaise);
      await assertBillAmountCoversPayments(userId, profile.id, date.slice(0, 7), updatedTotal);
    }
  }
  const deleted = await MilkEntry.findOneAndDelete({userId, milkProfileId: profile.id, entryDate: date, version});
  if (!deleted) {
    const exists = await MilkEntry.exists({userId, milkProfileId: profile.id, entryDate: date});
    if (exists) throw new HttpError(409, 'VERSION_CONFLICT', 'This entry changed on another device. Refresh and try again.');
  }
  return {deleted: Boolean(deleted)};
}

export async function getStatement(userId: string, month: string): Promise<StatementResult> {
  const profile = await findOwnedProfile(userId);
  if (!isValidMonthKey(month)) throw new HttpError(400, 'INVALID_MONTH', 'Use a valid YYYY-MM month.');
  const user = await findUser(userId);
  const today = dateKeyAt(new Date(), user.timezone);
  if (month > monthKeyAt(new Date(), user.timezone)) {
    throw new HttpError(400, 'FUTURE_MONTH', 'Statements are not available for a future month.');
  }
  if (month < profile.startDate.slice(0, 7)) {
    throw new HttpError(404, 'STATEMENT_NOT_FOUND', 'No statement is available before the profile start date.');
  }

  const bill = await MonthlyBill.findOne({userId, milkProfileId: profile.id, billMonth: month, status: 'finalized'}).lean();
  if (bill?.snapshot) {
    const snapshot = bill.snapshot as StatementResult;
    return {...snapshot, status: 'finalized', readOnly: true};
  }

  const [entries, priceHistory, quantityHistory] = await Promise.all([
    MilkEntry.find({userId, milkProfileId: profile.id, entryDate: {$gte: `${month}-01`, $lte: `${month}-31`}}).lean(),
    PriceHistory.find({userId, milkProfileId: profile.id}).sort({effectiveDate: 1}).lean(),
    QuantityHistory.find({userId, milkProfileId: profile.id}).sort({effectiveDate: 1}).lean(),
  ]);
  const year = Number(month.slice(0, 4));
  const monthNumber = Number(month.slice(5, 7));
  const lastDay = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  const maxDay = month === monthKeyAt(new Date(), user.timezone) ? Number(today.slice(-2)) : lastDay;
  const entryMap = new Map(entries.map(entry => [entry.entryDate, entry]));
  const records: DailyRecord[] = [];
  for (let day = 1; day <= maxDay; day += 1) {
    const date = `${month}-${String(day).padStart(2, '0')}`;
    if (date < profile.startDate) continue;
    const entry = entryMap.get(date);
    const quantity = quantityHistory.filter(item => item.effectiveDate <= date).at(-1)?.defaultQuantityMl ?? profile.defaultQuantityMl;
    const price = priceHistory.filter(item => item.effectiveDate <= date).at(-1)?.pricePerLitrePaise ?? profile.pricePerLitrePaise;
    const quantityMl = entry?.quantityMl ?? quantity;
    records.push({
      date,
      quantityMl,
      pricePerLitrePaise: price,
      amountPaise: calculateDailyAmount(quantityMl, price),
      isModified: Boolean(entry),
      isSkipped: quantityMl === 0,
      note: entry?.note ?? '',
      version: entry?.version ?? null,
    });
  }
  return statementDto(month, records, monthIsReadOnly(month, new Date(), user.timezone), 'provisional');
}

async function assertBillAmountCoversPayments(
  userId: string,
  profileId: Types.ObjectId | string,
  month: string,
  totalAmountPaise: number,
) {
  const payments = await MilkPayment.find({
    userId,
    milkProfileId: profileId,
    'allocations.billMonth': month,
  }).select('allocations').lean();
  const amountPaid = sumPaymentAllocations(payments).get(month) ?? 0;
  if (totalAmountPaise < amountPaid) {
    throw new HttpError(
      409,
      'PAYMENT_ADJUSTMENT_CONFLICT',
      `This change would make the ${month} bill smaller than its recorded payments.`,
      {amountPaidPaise: amountPaid, recalculatedBillPaise: totalAmountPaise},
    );
  }
}

async function assertProfileChangePreservesPayments(
  userId: string,
  profile: Awaited<ReturnType<typeof findOwnedProfile>>,
  patch: {
    defaultQuantityMl?: number;
    pricePerLitrePaise?: number;
  },
  quantityDate: string,
  priceDate: string,
) {
  const user = await findUser(userId);
  const currentMonth = monthKeyAt(new Date(), user.timezone);
  const firstChangedDate = [
    ...(patch.defaultQuantityMl !== undefined ? [quantityDate] : []),
    ...(patch.pricePerLitrePaise !== undefined ? [priceDate] : []),
  ].sort()[0];
  for (const month of monthsBetween(firstChangedDate.slice(0, 7), currentMonth)) {
    const statement = await getStatement(userId, month);
    const recalculatedTotal = statement.records.reduce((total, record) => {
      const quantity = patch.defaultQuantityMl !== undefined &&
        record.date >= quantityDate && !record.isModified
        ? patch.defaultQuantityMl
        : record.quantityMl;
      const price = patch.pricePerLitrePaise !== undefined && record.date >= priceDate
        ? patch.pricePerLitrePaise
        : record.pricePerLitrePaise;
      return total + calculateDailyAmount(quantity, price);
    }, 0);
    await assertBillAmountCoversPayments(userId, profile.id, month, recalculatedTotal);
  }
}

function statementDto(
  month: string,
  records: DailyRecord[],
  readOnly: boolean,
  status: 'provisional' | 'finalized',
): StatementResult {
  return {
    month,
    totalQuantityMl: records.reduce((sum, record) => sum + record.quantityMl, 0),
    totalAmountPaise: records.reduce((sum, record) => sum + record.amountPaise, 0),
    skippedDays: records.filter(record => record.quantityMl === 0).length,
    modifiedDays: records.filter(record => 'isModified' in record && record.isModified).length,
    status,
    readOnly: readOnly || status === 'finalized',
    records,
  };
}

function sumPaymentAllocations(
  payments: Array<Pick<MilkPaymentRecord, 'allocations'>>,
): Map<string, number> {
  const paidByMonth = new Map<string, number>();
  for (const payment of payments) {
    for (const allocation of payment.allocations) {
      paidByMonth.set(
        allocation.billMonth,
        (paidByMonth.get(allocation.billMonth) ?? 0) + allocation.amountPaise,
      );
    }
  }
  return paidByMonth;
}

async function loadBillingDataset(
  userId: string,
  session?: ClientSession,
): Promise<BillingDataset> {
  let profile: Awaited<ReturnType<typeof findOwnedProfile>>;
  let user: Awaited<ReturnType<typeof findUser>>;
  if (session) {
    profile = await findOwnedProfile(userId, undefined, session);
    user = await findUser(userId, session);
  } else {
    [profile, user] = await Promise.all([findOwnedProfile(userId), findUser(userId)]);
  }
  const currentMonth = monthKeyAt(new Date(), user.timezone);
  const firstMonth = profile.startDate.slice(0, 7);
  const monthKeys = monthsBetween(firstMonth, currentMonth);
  const dateRange = { $gte: profile.startDate, $lte: `${currentMonth}-31` };
  const billRange = { $gte: firstMonth, $lte: currentMonth };

  let storedBills: Array<{
    billMonth: string;
    totalQuantityMl: number;
    totalAmountPaise: number;
    status: string;
  }> = [];
  let entries: Array<{entryDate: string; quantityMl: number}> = [];
  let priceHistory: Array<{effectiveDate: string; pricePerLitrePaise: number}> = [];
  let quantityHistory: Array<{effectiveDate: string; defaultQuantityMl: number}> = [];
  let payments: Array<Pick<MilkPaymentRecord, 'allocations'>> = [];
  if (session) {
    storedBills = await MonthlyBill.find({
      userId, milkProfileId: profile.id, billMonth: billRange,
    }).session(session).lean();
    entries = await MilkEntry.find({
      userId, milkProfileId: profile.id, entryDate: dateRange,
    }).session(session).lean();
    priceHistory = await PriceHistory.find({
      userId, milkProfileId: profile.id, effectiveDate: {$lte: `${currentMonth}-31`},
    }).sort({effectiveDate: 1}).session(session).lean();
    quantityHistory = await QuantityHistory.find({
      userId, milkProfileId: profile.id, effectiveDate: {$lte: `${currentMonth}-31`},
    }).sort({effectiveDate: 1}).session(session).lean();
    payments = await MilkPayment.find({
      userId, milkProfileId: profile.id, 'allocations.billMonth': billRange,
    }).session(session).lean();
  } else {
    [storedBills, entries, priceHistory, quantityHistory, payments] = await Promise.all([
      MonthlyBill.find({userId, milkProfileId: profile.id, billMonth: billRange}).lean(),
      MilkEntry.find({userId, milkProfileId: profile.id, entryDate: dateRange}).lean(),
      PriceHistory.find({userId, milkProfileId: profile.id, effectiveDate: {$lte: `${currentMonth}-31`}})
        .sort({effectiveDate: 1}).lean(),
      QuantityHistory.find({userId, milkProfileId: profile.id, effectiveDate: {$lte: `${currentMonth}-31`}})
        .sort({effectiveDate: 1}).lean(),
      MilkPayment.find({userId, milkProfileId: profile.id, 'allocations.billMonth': billRange}).lean(),
    ]);
  }

  const storedByMonth = new Map(storedBills.map(bill => [bill.billMonth, bill]));
  const entryByDate = new Map(entries.map(entry => [entry.entryDate, entry]));
  const paidByMonth = sumPaymentAllocations(payments);
  const today = dateKeyAt(new Date(), user.timezone);
  const bills: BillingMonth[] = monthKeys.map(month => {
    const stored = storedByMonth.get(month);
    let totalQuantityMl: number;
    let totalAmountPaise: number;
    if (stored?.status === 'finalized') {
      totalQuantityMl = stored.totalQuantityMl;
      totalAmountPaise = stored.totalAmountPaise;
    } else {
      const year = Number(month.slice(0, 4));
      const monthNumber = Number(month.slice(5, 7));
      const lastDay = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
      const finalDay = month === currentMonth ? Number(today.slice(-2)) : lastDay;
      totalQuantityMl = 0;
      totalAmountPaise = 0;
      for (let day = 1; day <= finalDay; day += 1) {
        const date = `${month}-${String(day).padStart(2, '0')}`;
        if (date < profile.startDate) continue;
        const entry = entryByDate.get(date);
        const quantity = quantityHistory
          .filter(item => item.effectiveDate <= date).at(-1)?.defaultQuantityMl ?? profile.defaultQuantityMl;
        const price = priceHistory
          .filter(item => item.effectiveDate <= date).at(-1)?.pricePerLitrePaise ?? profile.pricePerLitrePaise;
        const quantityMl = entry?.quantityMl ?? quantity;
        totalQuantityMl += quantityMl;
        totalAmountPaise += calculateDailyAmount(quantityMl, price);
      }
    }
    const amountPaidPaise = paidByMonth.get(month) ?? 0;
    const remainingAmountPaise = Math.max(0, totalAmountPaise - amountPaidPaise);
    const status = paymentStatus(totalAmountPaise, amountPaidPaise);
    return {
      month,
      totalQuantityMl,
      totalAmountPaise,
      amountPaidPaise,
      remainingAmountPaise,
      paymentStatus: status,
      billStatus: stored?.status === 'finalized' ? 'finalized' : 'provisional',
      readOnly: stored?.status === 'finalized' || monthIsReadOnly(month, new Date(), user.timezone),
    };
  });
  return {profile, user, bills};
}

function summarizeBilling(dataset: BillingDataset, month: string) {
  const selectedBill = dataset.bills.find(bill => bill.month === month);
  if (!selectedBill) throw new HttpError(404, 'BILL_NOT_FOUND', 'No bill is available for that month.');
  const previousOutstandingPaise = dataset.bills
    .filter(bill => bill.month < month)
    .reduce((sum, bill) => sum + bill.remainingAmountPaise, 0);
  const totalBilledPaise = dataset.bills.reduce((sum, bill) => sum + bill.totalAmountPaise, 0);
  const totalPaidPaise = dataset.bills.reduce((sum, bill) => sum + bill.amountPaidPaise, 0);
  const totalOutstandingPaise = dataset.bills.reduce((sum, bill) => sum + bill.remainingAmountPaise, 0);
  return {
    month,
    currentMonthBillPaise: selectedBill.totalAmountPaise,
    currentMonthPaidPaise: selectedBill.amountPaidPaise,
    currentMonthRemainingPaise: selectedBill.remainingAmountPaise,
    previousOutstandingPaise,
    totalPayablePaise: previousOutstandingPaise + selectedBill.remainingAmountPaise,
    totalBilledPaise,
    totalPaidPaise,
    totalOutstandingPaise,
    paidMonths: dataset.bills.filter(bill => bill.paymentStatus === 'paid').length,
    unpaidMonths: dataset.bills.filter(bill => bill.paymentStatus === 'unpaid').length,
    partiallyPaidMonths: dataset.bills.filter(bill => bill.paymentStatus === 'partially_paid').length,
  };
}

export async function getStatementHistory(userId: string, page: number, limit: number) {
  const profile = await findOwnedProfile(userId);
  const user = await findUser(userId);
  const firstMonth = profile.startDate.slice(0, 7);
  const lastMonth = monthKeyAt(new Date(), user.timezone);
  const months: string[] = [];
  let [year, month] = firstMonth.split('-').map(Number);
  const [lastYear, lastMonthNumber] = lastMonth.split('-').map(Number);
  while (year < lastYear || (year === lastYear && month <= lastMonthNumber)) {
    months.push(`${year}-${String(month).padStart(2, '0')}`);
    month += 1;
    if (month === 13) { year += 1; month = 1; }
  }
  const selected = months.slice(Math.max(0, months.length - page * limit), Math.max(0, months.length - (page - 1) * limit)).reverse();
  const statements = await Promise.all(selected.map(async monthKey => {
    const bill = await MonthlyBill.findOne({userId, milkProfileId: profile.id, billMonth: monthKey}).lean();
    if (bill?.status === 'finalized') {
      return {
        month: monthKey,
        totalQuantityMl: bill.totalQuantityMl,
        totalAmountPaise: bill.totalAmountPaise,
        status: 'finalized',
        readOnly: true,
      };
    }
    const statement = await getStatement(userId, monthKey);
    return {
      month: monthKey,
      totalQuantityMl: statement.totalQuantityMl,
      totalAmountPaise: statement.totalAmountPaise,
      status: statement.status,
      readOnly: statement.readOnly,
    };
  }));
  return {page, limit, total: months.length, statements};
}

export async function finalizeBill(userId: string, month: string) {
  const statement = await getStatement(userId, month);
  if (statement.status === 'finalized') {
    throw new HttpError(409, 'BILL_ALREADY_FINALIZED', 'This bill has already been finalized.');
  }
  const now = new Date();
  const snapshot = {...statement, status: 'finalized', readOnly: true};
  const profile = await findOwnedProfile(userId);
  const bill = await MonthlyBill.findOneAndUpdate(
    {userId, milkProfileId: profile.id, billMonth: month, status: {$ne: 'finalized'}},
    {
      $set: {
        totalQuantityMl: statement.totalQuantityMl,
        totalAmountPaise: statement.totalAmountPaise,
        status: 'finalized',
        generatedAt: now,
        finalizedAt: now,
        snapshot,
      },
    },
    {upsert: true, returnDocument: 'after', runValidators: true},
  );
  return bill;
}

function assertMonthAvailable(month: string, profileStartDate: string, currentMonth: string) {
  if (!isValidMonthKey(month)) throw new HttpError(400, 'INVALID_MONTH', 'Use a valid YYYY-MM month.');
  if (month > currentMonth) throw new HttpError(400, 'FUTURE_MONTH', 'Bills are not available for a future month.');
  if (month < profileStartDate.slice(0, 7)) {
    throw new HttpError(404, 'BILL_NOT_FOUND', 'No bill is available before the profile start date.');
  }
}

export async function getBillingSummary(userId: string, requestedMonth?: string) {
  const dataset = await loadBillingDataset(userId);
  const currentMonth = monthKeyAt(new Date(), dataset.user.timezone);
  const month = requestedMonth ?? currentMonth;
  assertMonthAvailable(month, dataset.profile.startDate, currentMonth);
  const summary = summarizeBilling(dataset, month);
  return {
    ...summary,
    currentMonth,
    billingStartMonth: dataset.profile.startDate.slice(0, 7),
  };
}

export async function getBillDetails(userId: string, month: string) {
  const dataset = await loadBillingDataset(userId);
  const currentMonth = monthKeyAt(new Date(), dataset.user.timezone);
  assertMonthAvailable(month, dataset.profile.startDate, currentMonth);
  const bill = dataset.bills.find(item => item.month === month);
  if (!bill) throw new HttpError(404, 'BILL_NOT_FOUND', 'No bill is available for that month.');
  const statement = await getStatement(userId, month);
  const payments = await MilkPayment.find({
    userId,
    milkProfileId: dataset.profile.id,
    'allocations.billMonth': month,
  }).sort({paymentDate: 1, createdAt: 1}).lean();
  const previousOutstandingPaise = dataset.bills
    .filter(item => item.month < month)
    .reduce((sum, item) => sum + item.remainingAmountPaise, 0);
  const billingSummary = summarizeBilling(dataset, month);
  return {
    ...statement,
    ...bill,
    billingSummary: {
      ...billingSummary,
      currentMonth: currentMonth,
      billingStartMonth: dataset.profile.startDate.slice(0, 7),
    },
    bills: dataset.bills,
    previousOutstandingPaise,
    totalPayablePaise: previousOutstandingPaise + bill.remainingAmountPaise,
    paymentHistory: payments.map(payment => {
      const allocation = payment.allocations.find(item => item.billMonth === month);
      return {
        id: payment._id.toString(),
        amountPaise: allocation?.amountPaise ?? 0,
        paymentAmountPaise: payment.amountPaise,
        paymentDate: payment.paymentDate,
        paymentMethod: payment.paymentMethod,
        note: payment.note,
        idempotencyKey: payment.idempotencyKey,
      };
    }).filter(payment => payment.amountPaise > 0),
  };
}

export async function listBills(userId: string, page: number, limit: number) {
  const dataset = await loadBillingDataset(userId);
  const bills = dataset.bills.slice().reverse().slice((page - 1) * limit, page * limit);
  return {page, limit, total: dataset.bills.length, bills};
}

export async function listPayments(
  userId: string,
  query: {page: number; limit: number; month?: string},
) {
  const profile = await findOwnedProfile(userId);
  const filter: Record<string, unknown> = {userId, milkProfileId: profile.id};
  if (query.month) {
    assertMonthAvailable(query.month, profile.startDate, monthKeyAt(new Date(), (await findUser(userId)).timezone));
    filter['allocations.billMonth'] = query.month;
  }
  const [payments, total] = await Promise.all([
    MilkPayment.find(filter).sort({paymentDate: -1, createdAt: -1})
      .skip((query.page - 1) * query.limit).limit(query.limit).lean(),
    MilkPayment.countDocuments(filter),
  ]);
  return {page: query.page, limit: query.limit, total, payments};
}

function paymentFingerprint(input: PaymentInput): string {
  return createHash('sha256').update(JSON.stringify({
    amountPaise: input.amountPaise,
    paymentDate: input.paymentDate,
    paymentMethod: input.paymentMethod,
    note: input.note,
    month: input.month ?? null,
  })).digest('hex');
}

function replayedPayment(payment: MilkPaymentRecord, fingerprint: string) {
  if (payment.requestFingerprint !== fingerprint) {
    throw new HttpError(409, 'IDEMPOTENCY_KEY_REUSED', 'This payment request key has already been used with different details.');
  }
  return {payment, replayed: true};
}

export async function recordPayment(userId: string, input: PaymentInput) {
  const user = await findUser(userId);
  const currentDate = dateKeyAt(new Date(), user.timezone);
  const currentMonth = monthKeyAt(new Date(), user.timezone);
  if (input.paymentDate > currentDate) {
    throw new HttpError(422, 'PAYMENT_DATE_IN_FUTURE', 'A payment date cannot be in the future.');
  }
  const fingerprint = paymentFingerprint(input);
  const session = await mongoose.startSession();
  let outcome: {payment: MilkPaymentRecord; replayed: boolean} | null = null;
  try {
    await session.withTransaction(async () => {
      const existing = await MilkPayment.findOne({userId, idempotencyKey: input.idempotencyKey})
        .session(session).lean();
      if (existing) {
        outcome = replayedPayment(existing, fingerprint);
        return;
      }

      const profile = await findOwnedProfile(userId, undefined, session);
      await MilkProfile.updateOne(
        {_id: profile._id, userId},
        {$inc: {paymentRevision: 1}},
        {session, timestamps: false},
      );
      const dataset = await loadBillingDataset(userId, session);
      const requestedMonth = input.month;
      if (requestedMonth) assertMonthAvailable(requestedMonth, dataset.profile.startDate, currentMonth);
      const outstandingBills = dataset.bills.filter(bill =>
        bill.remainingAmountPaise > 0 && (!requestedMonth || bill.month === requestedMonth),
      );
      const available = outstandingBills.reduce((sum, bill) => sum + bill.remainingAmountPaise, 0);
      if (input.amountPaise > available) {
        throw new HttpError(
          422,
          'PAYMENT_EXCEEDS_OUTSTANDING',
          requestedMonth
            ? 'The payment cannot exceed the remaining amount for this month.'
            : 'The payment cannot exceed the total outstanding balance.',
          {availablePaise: available},
        );
      }
      if (available === 0) {
        throw new HttpError(409, 'NO_OUTSTANDING_BALANCE', 'There is no outstanding bill to pay.');
      }

      const {allocations, remaining: unallocatedAmount} = allocateOldestFirst(outstandingBills, input.amountPaise);
      if (unallocatedAmount !== 0) {
        throw new HttpError(409, 'PAYMENT_ALLOCATION_CONFLICT', 'The outstanding balances changed. Refresh the bills and try again.');
      }
      const [created] = await MilkPayment.create([{
        userId,
        milkProfileId: dataset.profile.id,
        idempotencyKey: input.idempotencyKey,
        requestFingerprint: fingerprint,
        amountPaise: input.amountPaise,
        paymentDate: input.paymentDate,
        paymentMethod: input.paymentMethod,
        note: input.note,
        allocations,
      }], {session});
      outcome = {payment: created.toObject(), replayed: false};
    });
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 11000) {
      const existing = await MilkPayment.findOne({userId, idempotencyKey: input.idempotencyKey}).lean();
      if (existing) outcome = replayedPayment(existing, fingerprint);
      else throw error;
    } else {
      throw error;
    }
  } finally {
    await session.endSession();
  }
  if (!outcome) throw new HttpError(500, 'PAYMENT_RECORD_FAILED', 'Unable to record the payment.');
  return outcome;
}

async function getImportContext(userId: string, input: ImportInput) {
  const user = await findUser(userId);
  const profile = await MilkProfile.findOne({userId, isActive: true});
  return {user, profile, entries: input.entries};
}

export async function previewLegacyImport(
  userId: string,
  input: ImportInput,
) {
  const {user, profile, entries} = await getImportContext(userId, input);
  const profileStartDate = profile?.startDate ?? input.profile.startDate;
  const today = dateKeyAt(new Date(), user.timezone);
  if (input.profile.startDate > today) {
    throw new HttpError(400, 'IMPORT_FUTURE_DATE', 'A milk profile cannot start in the future.');
  }
  if (entries.some(entry => entry.entryDate > today)) {
    throw new HttpError(400, 'IMPORT_FUTURE_DATE', 'Future milk entries cannot be imported.');
  }
  if (
    input.priceHistory.some(item => item.effectiveDate > today || item.effectiveDate < profileStartDate) ||
    input.quantityHistory.some(item => item.effectiveDate > today || item.effectiveDate < profileStartDate)
  ) {
    throw new HttpError(400, 'INVALID_IMPORT_HISTORY', 'Imported history dates must be on or after the profile start date and not in the future.');
  }
  if (entries.some(entry => entry.entryDate < profileStartDate)) {
    throw new HttpError(400, 'IMPORT_BEFORE_PROFILE_START', 'Some entries are before the milk profile start date.');
  }
  const existingProfileId = profile?.id;
  const existingDates = existingProfileId
    ? await MilkEntry.find({userId, milkProfileId: existingProfileId, entryDate: {$in: entries.map(entry => entry.entryDate)}})
      .select('entryDate').lean()
    : [];
  const existingSet = new Set(existingDates.map(entry => entry.entryDate));
  const newEntries = entries.filter(entry => !existingSet.has(entry.entryDate));
  const finalizedMonths = existingProfileId
    ? await MonthlyBill.find({userId, milkProfileId: existingProfileId, status: 'finalized', billMonth: {$in: newEntries.map(entry => entry.entryDate.slice(0, 7))}})
      .select('billMonth').lean()
    : [];
  const finalizedSet = new Set(finalizedMonths.map(bill => bill.billMonth));
  const eligible = newEntries.filter(entry => !finalizedSet.has(entry.entryDate.slice(0, 7)));
  return {
    profileExists: Boolean(profile),
    totalEntries: entries.length,
    duplicateCount: existingSet.size,
    finalizedMonthCount: finalizedSet.size,
    importableCount: eligible.length,
    editableWindowCount: eligible.filter(entry => canEditMilkDate(entry.entryDate, new Date(), user.timezone)).length,
    historicalReadOnlyCount: eligible.filter(entry => !canEditMilkDate(entry.entryDate, new Date(), user.timezone)).length,
    priceHistoryCount: input.priceHistory.length,
    quantityHistoryCount: input.quantityHistory.length,
  };
}

export async function commitLegacyImport(
  userId: string,
  input: ImportInput & {importKey: string; includeHistoricalReadOnly: true},
) {
  const preview = await previewLegacyImport(userId, input);
  const existingImport = await LegacyImport.findOne({userId, importKey: input.importKey});
  if (existingImport) {
    throw new HttpError(409, 'IMPORT_ALREADY_COMPLETED', 'This local data import has already been completed.');
  }
  const user = await findUser(userId);
  const transaction = await mongoose.startSession();
  let profileId: string | null = null;
  let importedCount = 0;
  try {
    await transaction.withTransaction(async () => {
      let profile = await MilkProfile.findOne({userId, isActive: true}).session(transaction);
      if (!profile) {
        const [created] = await MilkProfile.create([{userId, ...input.profile, isActive: true}], {session: transaction});
        profile = created;
      }
      profileId = profile.id;
      const importedPrices = input.priceHistory.length
        ? input.priceHistory
        : [{pricePerLitrePaise: input.profile.pricePerLitrePaise, effectiveDate: input.profile.startDate}];
      const importedQuantities = input.quantityHistory.length
        ? input.quantityHistory
        : [{defaultQuantityMl: input.profile.defaultQuantityMl, effectiveDate: input.profile.startDate}];
      const existingPrices = await PriceHistory.find({
        userId, milkProfileId: profile._id, effectiveDate: {$in: importedPrices.map(item => item.effectiveDate)},
      }).select('effectiveDate').session(transaction).lean();
      const existingPriceDates = new Set(existingPrices.map(item => item.effectiveDate));
      const existingQuantities = await QuantityHistory.find({
        userId, milkProfileId: profile._id, effectiveDate: {$in: importedQuantities.map(item => item.effectiveDate)},
      }).select('effectiveDate').session(transaction).lean();
      const existingQuantityDates = new Set(existingQuantities.map(item => item.effectiveDate));
      const pricesToInsert = importedPrices.filter(item => !existingPriceDates.has(item.effectiveDate));
      const quantitiesToInsert = importedQuantities.filter(item => !existingQuantityDates.has(item.effectiveDate));
      if (pricesToInsert.length) {
        await PriceHistory.insertMany(pricesToInsert.map(item => ({userId, milkProfileId: profile!._id, ...item})), {session: transaction});
      }
      if (quantitiesToInsert.length) {
        await QuantityHistory.insertMany(quantitiesToInsert.map(item => ({userId, milkProfileId: profile!._id, ...item})), {session: transaction});
      }
      const dates = input.entries.map(entry => entry.entryDate);
      const existing = await MilkEntry.find({
        userId, milkProfileId: profile.id, entryDate: {$in: dates},
      }).select('entryDate').session(transaction).lean();
      const existingSet = new Set(existing.map(entry => entry.entryDate));
      const finalized = await MonthlyBill.find({
        userId,
        milkProfileId: profile.id,
        billMonth: {$in: dates.map(date => date.slice(0, 7))},
        status: 'finalized',
      }).select('billMonth').session(transaction).lean();
      const finalizedSet = new Set(finalized.map(bill => bill.billMonth));
      const candidates = input.entries.filter(entry =>
        !existingSet.has(entry.entryDate) && !finalizedSet.has(entry.entryDate.slice(0, 7)));
      if (candidates.length) {
        await MilkEntry.insertMany(candidates.map(entry => ({
          userId,
          milkProfileId: profile!.id,
          entryDate: entry.entryDate,
          quantityMl: entry.quantityMl,
          note: entry.note ?? '',
          version: 1,
          isLegacyImported: true,
        })), {session: transaction, ordered: true});
      }
      importedCount = candidates.length;
      const currentMonth = monthKeyAt(new Date(), user.timezone);
      const historicalCount = candidates.filter(entry =>
        entry.entryDate.slice(0, 7) < currentMonth &&
        !canEditMilkDate(entry.entryDate, new Date(), user.timezone),
      ).length;
      await LegacyImport.create([{
        userId,
        milkProfileId: profile.id,
        importKey: input.importKey,
        importedCount,
        historicalCount,
        completedAt: new Date(),
      }], {session: transaction});
    });
  } finally {
    await transaction.endSession();
  }
  if (!profileId) throw new HttpError(500, 'IMPORT_FAILED', 'Unable to import the local milk data.');
  return {
    profileId,
    importedCount,
    duplicateCount: preview.duplicateCount,
    skippedFinalizedMonths: preview.finalizedMonthCount,
    editableWindowCount: preview.editableWindowCount,
    historicalReadOnlyCount: preview.historicalReadOnlyCount,
  };
}
