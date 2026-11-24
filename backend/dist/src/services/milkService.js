import mongoose from 'mongoose';
import { LegacyImport, MilkEntry, MilkProfile, MonthlyBill, PriceHistory, QuantityHistory, User } from '../models/index.js';
import { canEditMilkDate, dateKeyAt, isStartDateInAllowedRange, isValidDateKey, isValidMonthKey, monthKeyAt, } from '../utils/date.js';
import { HttpError } from '../utils/errors.js';
import { calculateDailyAmount } from './statementCalculation.js';
async function findUser(userId) {
    const user = await User.findById(userId);
    if (!user)
        throw new HttpError(401, 'SESSION_INVALID', 'Sign in again to continue.');
    return user;
}
async function findOwnedProfile(userId, profileId) {
    const query = profileId
        ? { _id: profileId, userId }
        : { userId, isActive: true };
    const profile = await MilkProfile.findOne(query);
    if (!profile)
        throw new HttpError(404, 'PROFILE_NOT_FOUND', 'No milk profile was found for this account.');
    return profile;
}
function monthIsReadOnly(month, currentDate, timezone) {
    return !canEditMilkDate(`${month}-01`, currentDate, timezone);
}
async function assertEditableDate(userId, profileId, date) {
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
export async function listProfiles(userId) {
    const profiles = await MilkProfile.find({ userId }).sort({ isActive: -1, createdAt: 1 });
    const data = await Promise.all(profiles.map(async (profile) => ({
        id: profile.id,
        name: profile.name,
        defaultQuantityMl: profile.defaultQuantityMl,
        pricePerLitrePaise: profile.pricePerLitrePaise,
        startDate: profile.startDate,
        isActive: profile.isActive,
        createdAt: profile.createdAt,
        updatedAt: profile.updatedAt,
        priceHistory: await PriceHistory.find({ userId, milkProfileId: profile.id }).sort({ effectiveDate: 1 }).lean(),
        quantityHistory: await QuantityHistory.find({ userId, milkProfileId: profile.id }).sort({ effectiveDate: 1 }).lean(),
    })));
    return data;
}
export async function getProfile(userId, profileId) {
    const profile = await findOwnedProfile(userId, profileId);
    const [priceHistory, quantityHistory] = await Promise.all([
        PriceHistory.find({ userId, milkProfileId: profile.id }).sort({ effectiveDate: 1 }).lean(),
        QuantityHistory.find({ userId, milkProfileId: profile.id }).sort({ effectiveDate: 1 }).lean(),
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
export async function createProfile(userId, input) {
    const user = await findUser(userId);
    if (!isStartDateInAllowedRange(input.startDate, new Date(), user.timezone)) {
        throw new HttpError(422, 'START_DATE_OUT_OF_RANGE', 'Choose a tracking start date from the earliest allowed date through today.');
    }
    if (await MilkProfile.exists({ userId, isActive: true })) {
        throw new HttpError(409, 'ACTIVE_PROFILE_EXISTS', 'This account already has an active milk profile.');
    }
    const transaction = await mongoose.startSession();
    let created;
    try {
        await transaction.withTransaction(async () => {
            const [profile] = await MilkProfile.create([{
                    userId,
                    ...input,
                    isActive: true,
                }], { session: transaction });
            created = profile;
            await PriceHistory.create([{
                    userId,
                    milkProfileId: profile.id,
                    pricePerLitrePaise: input.pricePerLitrePaise,
                    effectiveDate: input.startDate,
                }], { session: transaction });
            await QuantityHistory.create([{
                    userId,
                    milkProfileId: profile.id,
                    defaultQuantityMl: input.defaultQuantityMl,
                    effectiveDate: input.startDate,
                }], { session: transaction });
        });
    }
    finally {
        await transaction.endSession();
    }
    if (!created)
        throw new HttpError(500, 'PROFILE_CREATE_FAILED', 'Unable to create the milk profile.');
    return getProfile(userId, created.id);
}
export async function updateProfile(userId, profileId, patch) {
    const profile = await findOwnedProfile(userId, profileId);
    const startDateChanged = patch.startDate !== undefined && patch.startDate !== profile.startDate;
    const user = startDateChanged ? await findUser(userId) : null;
    if (startDateChanged) {
        if (patch.expectedStartDate !== profile.startDate) {
            throw new HttpError(409, 'PROFILE_START_DATE_CONFLICT', 'The tracking start date changed on another device. Refresh the profile and try again.');
        }
        if (!isStartDateInAllowedRange(patch.startDate, new Date(), user.timezone)) {
            throw new HttpError(422, 'START_DATE_OUT_OF_RANGE', 'Choose a tracking start date from the earliest allowed date through today.');
        }
        const firstAffectedMonth = [patch.startDate, profile.startDate].sort()[0].slice(0, 7);
        const lastAffectedMonth = [patch.startDate, profile.startDate].sort()[1].slice(0, 7);
        const finalized = await MonthlyBill.findOne({
            userId,
            milkProfileId: profile._id,
            status: 'finalized',
            billMonth: { $gte: firstAffectedMonth, $lte: lastAffectedMonth },
        }).select('billMonth').lean();
        if (finalized) {
            throw new HttpError(409, 'FINALIZED_BILL_CONFLICT', `The start date cannot change because ${finalized.billMonth} has a finalized bill. Finalized bill snapshots are preserved.`);
        }
    }
    const quantityChanged = patch.defaultQuantityMl !== undefined;
    const priceChanged = patch.pricePerLitrePaise !== undefined;
    const editUser = quantityChanged || priceChanged ? await findUser(userId) : user;
    const effectiveToday = editUser ? dateKeyAt(new Date(), editUser.timezone) : undefined;
    const quantityDate = patch.quantityEffectiveDate ?? effectiveToday ?? '';
    const priceDate = patch.priceEffectiveDate ?? effectiveToday ?? '';
    if (quantityChanged)
        await assertEditableDate(userId, profile.id, quantityDate);
    if (priceChanged)
        await assertEditableDate(userId, profile.id, priceDate);
    const transaction = await mongoose.startSession();
    try {
        await transaction.withTransaction(async () => {
            if (patch.name !== undefined)
                profile.name = patch.name;
            if (startDateChanged) {
                const earliestPrice = await PriceHistory.findOne({ userId, milkProfileId: profile._id })
                    .sort({ effectiveDate: 1 }).session(transaction);
                const earliestQuantity = await QuantityHistory.findOne({ userId, milkProfileId: profile._id })
                    .sort({ effectiveDate: 1 }).session(transaction);
                if (!earliestPrice || earliestPrice.effectiveDate > patch.startDate) {
                    await PriceHistory.updateOne({ userId, milkProfileId: profile._id, effectiveDate: patch.startDate }, { $setOnInsert: {
                            userId,
                            milkProfileId: profile._id,
                            effectiveDate: patch.startDate,
                            pricePerLitrePaise: earliestPrice?.pricePerLitrePaise ?? profile.pricePerLitrePaise,
                        } }, { upsert: true, session: transaction });
                }
                if (!earliestQuantity || earliestQuantity.effectiveDate > patch.startDate) {
                    await QuantityHistory.updateOne({ userId, milkProfileId: profile._id, effectiveDate: patch.startDate }, { $setOnInsert: {
                            userId,
                            milkProfileId: profile._id,
                            effectiveDate: patch.startDate,
                            defaultQuantityMl: earliestQuantity?.defaultQuantityMl ?? profile.defaultQuantityMl,
                        } }, { upsert: true, session: transaction });
                }
                profile.startDate = patch.startDate;
            }
            if (quantityChanged)
                profile.defaultQuantityMl = patch.defaultQuantityMl;
            if (priceChanged)
                profile.pricePerLitrePaise = patch.pricePerLitrePaise;
            await profile.save({ session: transaction });
            if (quantityChanged) {
                await QuantityHistory.findOneAndUpdate({ userId, milkProfileId: profile.id, effectiveDate: quantityDate }, { $set: { defaultQuantityMl: patch.defaultQuantityMl } }, { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true, session: transaction });
            }
            if (priceChanged) {
                await PriceHistory.findOneAndUpdate({ userId, milkProfileId: profile.id, effectiveDate: priceDate }, { $set: { pricePerLitrePaise: patch.pricePerLitrePaise } }, { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true, session: transaction });
            }
        });
    }
    catch (error) {
        if (error instanceof Error && error.name === 'VersionError') {
            throw new HttpError(409, 'PROFILE_VERSION_CONFLICT', 'The milk profile changed on another device. Refresh it and try again.');
        }
        throw error;
    }
    finally {
        await transaction.endSession();
    }
    return getProfile(userId, profileId);
}
export async function listEntries(userId, month) {
    const profile = await findOwnedProfile(userId);
    return MilkEntry.find({
        userId,
        milkProfileId: profile.id,
        entryDate: { $gte: `${month}-01`, $lte: `${month}-31` },
    }).sort({ entryDate: 1 }).lean();
}
export async function upsertEntry(userId, date, input) {
    const profile = await findOwnedProfile(userId);
    await assertEditableDate(userId, profile.id, date);
    const existing = await MilkEntry.findOne({ userId, milkProfileId: profile.id, entryDate: date });
    if (!existing) {
        if (input.version !== 0)
            throw new HttpError(409, 'VERSION_CONFLICT', 'This entry changed on another device. Refresh and try again.');
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
        }
        catch (error) {
            if (error instanceof Error && 'code' in error && error.code === 11000) {
                throw new HttpError(409, 'VERSION_CONFLICT', 'This entry changed on another device. Refresh and try again.');
            }
            throw error;
        }
    }
    if (existing.version !== input.version) {
        throw new HttpError(409, 'VERSION_CONFLICT', 'This entry changed on another device. Refresh and try again.');
    }
    const updated = await MilkEntry.findOneAndUpdate({ _id: existing.id, userId, version: input.version }, { $set: { quantityMl: input.quantityMl, note: input.note ?? '' }, $inc: { version: 1 } }, { returnDocument: 'after', runValidators: true });
    if (!updated)
        throw new HttpError(409, 'VERSION_CONFLICT', 'This entry changed on another device. Refresh and try again.');
    return updated;
}
export async function deleteEntry(userId, date, version) {
    const profile = await findOwnedProfile(userId);
    await assertEditableDate(userId, profile.id, date);
    const deleted = await MilkEntry.findOneAndDelete({ userId, milkProfileId: profile.id, entryDate: date, version });
    if (!deleted) {
        const exists = await MilkEntry.exists({ userId, milkProfileId: profile.id, entryDate: date });
        if (exists)
            throw new HttpError(409, 'VERSION_CONFLICT', 'This entry changed on another device. Refresh and try again.');
    }
    return { deleted: Boolean(deleted) };
}
export async function getStatement(userId, month) {
    const profile = await findOwnedProfile(userId);
    if (!isValidMonthKey(month))
        throw new HttpError(400, 'INVALID_MONTH', 'Use a valid YYYY-MM month.');
    const user = await findUser(userId);
    const today = dateKeyAt(new Date(), user.timezone);
    if (month > monthKeyAt(new Date(), user.timezone)) {
        throw new HttpError(400, 'FUTURE_MONTH', 'Statements are not available for a future month.');
    }
    if (month < profile.startDate.slice(0, 7)) {
        throw new HttpError(404, 'STATEMENT_NOT_FOUND', 'No statement is available before the profile start date.');
    }
    const bill = await MonthlyBill.findOne({ userId, milkProfileId: profile.id, billMonth: month, status: 'finalized' }).lean();
    if (bill?.snapshot) {
        const snapshot = bill.snapshot;
        return { ...snapshot, status: 'finalized', readOnly: true };
    }
    const [entries, priceHistory, quantityHistory] = await Promise.all([
        MilkEntry.find({ userId, milkProfileId: profile.id, entryDate: { $gte: `${month}-01`, $lte: `${month}-31` } }).lean(),
        PriceHistory.find({ userId, milkProfileId: profile.id }).sort({ effectiveDate: 1 }).lean(),
        QuantityHistory.find({ userId, milkProfileId: profile.id }).sort({ effectiveDate: 1 }).lean(),
    ]);
    const year = Number(month.slice(0, 4));
    const monthNumber = Number(month.slice(5, 7));
    const lastDay = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
    const maxDay = month === monthKeyAt(new Date(), user.timezone) ? Number(today.slice(-2)) : lastDay;
    const entryMap = new Map(entries.map(entry => [entry.entryDate, entry]));
    const records = [];
    for (let day = 1; day <= maxDay; day += 1) {
        const date = `${month}-${String(day).padStart(2, '0')}`;
        if (date < profile.startDate)
            continue;
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
function statementDto(month, records, readOnly, status) {
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
export async function getStatementHistory(userId, page, limit) {
    const profile = await findOwnedProfile(userId);
    const user = await findUser(userId);
    const firstMonth = profile.startDate.slice(0, 7);
    const lastMonth = monthKeyAt(new Date(), user.timezone);
    const months = [];
    let [year, month] = firstMonth.split('-').map(Number);
    const [lastYear, lastMonthNumber] = lastMonth.split('-').map(Number);
    while (year < lastYear || (year === lastYear && month <= lastMonthNumber)) {
        months.push(`${year}-${String(month).padStart(2, '0')}`);
        month += 1;
        if (month === 13) {
            year += 1;
            month = 1;
        }
    }
    const selected = months.slice(Math.max(0, months.length - page * limit), Math.max(0, months.length - (page - 1) * limit)).reverse();
    const statements = await Promise.all(selected.map(async (monthKey) => {
        const bill = await MonthlyBill.findOne({ userId, milkProfileId: profile.id, billMonth: monthKey }).lean();
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
    return { page, limit, total: months.length, statements };
}
export async function finalizeBill(userId, month) {
    const statement = await getStatement(userId, month);
    if (statement.status === 'finalized') {
        throw new HttpError(409, 'BILL_ALREADY_FINALIZED', 'This bill has already been finalized.');
    }
    const now = new Date();
    const snapshot = { ...statement, status: 'finalized', readOnly: true };
    const profile = await findOwnedProfile(userId);
    const bill = await MonthlyBill.findOneAndUpdate({ userId, milkProfileId: profile.id, billMonth: month, status: { $ne: 'finalized' } }, {
        $set: {
            totalQuantityMl: statement.totalQuantityMl,
            totalAmountPaise: statement.totalAmountPaise,
            status: 'finalized',
            generatedAt: now,
            finalizedAt: now,
            snapshot,
        },
    }, { upsert: true, returnDocument: 'after', runValidators: true });
    return bill;
}
export async function listBills(userId, page, limit) {
    const profile = await findOwnedProfile(userId);
    const [bills, total] = await Promise.all([
        MonthlyBill.find({ userId, milkProfileId: profile.id })
            .sort({ billMonth: -1 }).skip((page - 1) * limit).limit(limit).lean(),
        MonthlyBill.countDocuments({ userId, milkProfileId: profile.id }),
    ]);
    return { page, limit, total, bills };
}
async function getImportContext(userId, input) {
    const user = await findUser(userId);
    const profile = await MilkProfile.findOne({ userId, isActive: true });
    return { user, profile, entries: input.entries };
}
export async function previewLegacyImport(userId, input) {
    const { user, profile, entries } = await getImportContext(userId, input);
    const profileStartDate = profile?.startDate ?? input.profile.startDate;
    const today = dateKeyAt(new Date(), user.timezone);
    if (input.profile.startDate > today) {
        throw new HttpError(400, 'IMPORT_FUTURE_DATE', 'A milk profile cannot start in the future.');
    }
    if (entries.some(entry => entry.entryDate > today)) {
        throw new HttpError(400, 'IMPORT_FUTURE_DATE', 'Future milk entries cannot be imported.');
    }
    if (input.priceHistory.some(item => item.effectiveDate > today || item.effectiveDate < profileStartDate) ||
        input.quantityHistory.some(item => item.effectiveDate > today || item.effectiveDate < profileStartDate)) {
        throw new HttpError(400, 'INVALID_IMPORT_HISTORY', 'Imported history dates must be on or after the profile start date and not in the future.');
    }
    if (entries.some(entry => entry.entryDate < profileStartDate)) {
        throw new HttpError(400, 'IMPORT_BEFORE_PROFILE_START', 'Some entries are before the milk profile start date.');
    }
    const existingProfileId = profile?.id;
    const existingDates = existingProfileId
        ? await MilkEntry.find({ userId, milkProfileId: existingProfileId, entryDate: { $in: entries.map(entry => entry.entryDate) } })
            .select('entryDate').lean()
        : [];
    const existingSet = new Set(existingDates.map(entry => entry.entryDate));
    const newEntries = entries.filter(entry => !existingSet.has(entry.entryDate));
    const finalizedMonths = existingProfileId
        ? await MonthlyBill.find({ userId, milkProfileId: existingProfileId, status: 'finalized', billMonth: { $in: newEntries.map(entry => entry.entryDate.slice(0, 7)) } })
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
export async function commitLegacyImport(userId, input) {
    const preview = await previewLegacyImport(userId, input);
    const existingImport = await LegacyImport.findOne({ userId, importKey: input.importKey });
    if (existingImport) {
        throw new HttpError(409, 'IMPORT_ALREADY_COMPLETED', 'This local data import has already been completed.');
    }
    const user = await findUser(userId);
    const transaction = await mongoose.startSession();
    let profileId = null;
    let importedCount = 0;
    try {
        await transaction.withTransaction(async () => {
            let profile = await MilkProfile.findOne({ userId, isActive: true }).session(transaction);
            if (!profile) {
                const [created] = await MilkProfile.create([{ userId, ...input.profile, isActive: true }], { session: transaction });
                profile = created;
            }
            profileId = profile.id;
            const importedPrices = input.priceHistory.length
                ? input.priceHistory
                : [{ pricePerLitrePaise: input.profile.pricePerLitrePaise, effectiveDate: input.profile.startDate }];
            const importedQuantities = input.quantityHistory.length
                ? input.quantityHistory
                : [{ defaultQuantityMl: input.profile.defaultQuantityMl, effectiveDate: input.profile.startDate }];
            const existingPrices = await PriceHistory.find({
                userId, milkProfileId: profile._id, effectiveDate: { $in: importedPrices.map(item => item.effectiveDate) },
            }).select('effectiveDate').session(transaction).lean();
            const existingPriceDates = new Set(existingPrices.map(item => item.effectiveDate));
            const existingQuantities = await QuantityHistory.find({
                userId, milkProfileId: profile._id, effectiveDate: { $in: importedQuantities.map(item => item.effectiveDate) },
            }).select('effectiveDate').session(transaction).lean();
            const existingQuantityDates = new Set(existingQuantities.map(item => item.effectiveDate));
            const pricesToInsert = importedPrices.filter(item => !existingPriceDates.has(item.effectiveDate));
            const quantitiesToInsert = importedQuantities.filter(item => !existingQuantityDates.has(item.effectiveDate));
            if (pricesToInsert.length) {
                await PriceHistory.insertMany(pricesToInsert.map(item => ({ userId, milkProfileId: profile._id, ...item })), { session: transaction });
            }
            if (quantitiesToInsert.length) {
                await QuantityHistory.insertMany(quantitiesToInsert.map(item => ({ userId, milkProfileId: profile._id, ...item })), { session: transaction });
            }
            const dates = input.entries.map(entry => entry.entryDate);
            const existing = await MilkEntry.find({
                userId, milkProfileId: profile.id, entryDate: { $in: dates },
            }).select('entryDate').session(transaction).lean();
            const existingSet = new Set(existing.map(entry => entry.entryDate));
            const finalized = await MonthlyBill.find({
                userId,
                milkProfileId: profile.id,
                billMonth: { $in: dates.map(date => date.slice(0, 7)) },
                status: 'finalized',
            }).select('billMonth').session(transaction).lean();
            const finalizedSet = new Set(finalized.map(bill => bill.billMonth));
            const candidates = input.entries.filter(entry => !existingSet.has(entry.entryDate) && !finalizedSet.has(entry.entryDate.slice(0, 7)));
            if (candidates.length) {
                await MilkEntry.insertMany(candidates.map(entry => ({
                    userId,
                    milkProfileId: profile.id,
                    entryDate: entry.entryDate,
                    quantityMl: entry.quantityMl,
                    note: entry.note ?? '',
                    version: 1,
                    isLegacyImported: true,
                })), { session: transaction, ordered: true });
            }
            importedCount = candidates.length;
            const currentMonth = monthKeyAt(new Date(), user.timezone);
            const historicalCount = candidates.filter(entry => entry.entryDate.slice(0, 7) < currentMonth &&
                !canEditMilkDate(entry.entryDate, new Date(), user.timezone)).length;
            await LegacyImport.create([{
                    userId,
                    milkProfileId: profile.id,
                    importKey: input.importKey,
                    importedCount,
                    historicalCount,
                    completedAt: new Date(),
                }], { session: transaction });
        });
    }
    finally {
        await transaction.endSession();
    }
    if (!profileId)
        throw new HttpError(500, 'IMPORT_FAILED', 'Unable to import the local milk data.');
    return {
        profileId,
        importedCount,
        duplicateCount: preview.duplicateCount,
        skippedFinalizedMonths: preview.finalizedMonthCount,
        editableWindowCount: preview.editableWindowCount,
        historicalReadOnlyCount: preview.historicalReadOnlyCount,
    };
}
