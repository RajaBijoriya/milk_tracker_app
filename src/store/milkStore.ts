import {create} from 'zustand';
import {MilkEntry, MilkProfile, MonthlySummary, PriceHistory, QuantityHistory} from '../types/milk.types';
import {loadCloudData} from '../database/cloudCache';
import {getMonthlySummary} from '../services/billingService';
import * as syncService from '../services/api/syncService';
import {MilkStatement} from '../services/api/milkApiService';
import {monthKey} from '../utils/dateUtils';

type Store = {
  profile: MilkProfile | null;
  entries: MilkEntry[];
  priceHistory: PriceHistory[];
  quantityHistory: QuantityHistory[];
  summary: MonthlySummary | null;
  statement: MilkStatement | null;
  selectedMonth: string;
  ownerUserId: string | null;
  ownerTimezone: string;
  loading: boolean;
  initialized: boolean;
  offline: boolean;
  error: string | null;
  statementError: string | null;
  statementLoading: boolean;
  load: (userId: string, timezone: string) => Promise<void>;
  loadMonth: (month: string) => Promise<void>;
  loadStatement: (month: string) => Promise<void>;
  createProfile: (profile: {name: string; defaultQuantityMl: number; pricePerLitrePaise: number; startDate: string}) => Promise<void>;
  updateProfile: (profile: MilkProfile, effectiveDate: string) => Promise<void>;
  saveEntry: (date: string, quantityMl: number, note?: string) => Promise<void>;
  resetEntry: (date: string) => Promise<void>;
  setSelectedMonth: (month: string) => Promise<void>;
  refreshSummary: () => Promise<void>;
};

function summaryFromStatement(statement: MilkStatement): MonthlySummary {
  return {
    month: statement.month,
    records: statement.records.map(record => ({
      date: record.date,
      quantityMl: record.quantityMl,
      pricePerLitrePaise: record.pricePerLitrePaise,
      amountPaise: record.amountPaise,
      isModified: record.isModified,
      isSkipped: record.isSkipped,
      note: record.note || null,
    })),
    totalQuantityMl: statement.totalQuantityMl,
    totalAmountPaise: statement.totalAmountPaise,
    skippedDays: statement.skippedDays,
    modifiedDays: statement.modifiedDays,
    isMonthToDate: statement.month === monthKey(new Date()),
  };
}

function applyCachedData(
  data: Awaited<ReturnType<typeof loadCloudData>>,
  set: (partial: Partial<Store>) => void,
) {
  if (!data) return;
  set({
    profile: data.profile,
    entries: data.entries,
    priceHistory: data.priceHistory,
    quantityHistory: data.quantityHistory,
  });
}

export const useMilkStore = create<Store>((set, get) => ({
  profile: null,
  entries: [],
  priceHistory: [],
  quantityHistory: [],
  summary: null,
  statement: null,
  selectedMonth: monthKey(new Date()),
  ownerUserId: null,
  ownerTimezone: 'Asia/Kolkata',
  loading: true,
  initialized: false,
  offline: false,
  error: null,
  statementError: null,
  statementLoading: false,
  load: async (userId, timezone) => {
    set({loading: true, error: null, ownerUserId: userId, ownerTimezone: timezone});
    try {
      const result = await syncService.syncOnLogin(userId, timezone);
      if (!result.profile) {
        set({
          profile: null,
          entries: [],
          priceHistory: [],
          quantityHistory: [],
          summary: null,
          statement: null,
          initialized: true,
          loading: false,
          offline: false,
          ownerUserId: userId,
        });
        return;
      }
      const data = result.profile;
      const currentMonth = monthKey(new Date());
      const statementResult = await syncService.loadStatement(userId, currentMonth);
      set({
        profile: data?.profile ?? null,
        entries: data?.entries ?? [],
        priceHistory: data?.priceHistory ?? [],
        quantityHistory: data?.quantityHistory ?? [],
        statement: statementResult.statement,
        summary: summaryFromStatement(statementResult.statement),
        selectedMonth: currentMonth,
        initialized: true,
        loading: false,
        offline: result.offline || statementResult.offline,
        error: null,
      });
    } catch (error) {
      const cached = await loadCloudData(userId);
      if (cached) {
        applyCachedData(cached, set);
        const month = monthKey(new Date());
        const cachedStatement = await syncService.loadStatement(userId, month).catch(() => null);
        set({
          initialized: true,
          loading: false,
          offline: true,
          ownerUserId: userId,
          statement: cachedStatement?.statement ?? null,
          summary: cachedStatement ? summaryFromStatement(cachedStatement.statement) : null,
          error: null,
        });
        return;
      }
      set({
        initialized: true,
        loading: false,
        offline: false,
        ownerUserId: userId,
        error: error instanceof Error ? error.message : 'Unable to load cloud data.',
      });
    }
  },
  loadMonth: async month => {
    const userId = get().ownerUserId;
    if (!userId) return;
    try {
      let profileOffline = false;
      try {
        const latest = await syncService.refreshProfileFromServer(userId);
        if (latest) applyCachedData(latest, set);
      } catch (error) {
        if (!syncService.isNetworkFailure(error)) throw error;
        profileOffline = true;
      }
      const result = await syncService.loadMonthEntries(userId, month);
      const cached = await loadCloudData(userId);
      applyCachedData(cached, set);
      set({offline: result.offline || profileOffline, error: null});
    } catch (error) {
      set({error: error instanceof Error ? error.message : 'Unable to load this month.'});
    }
  },
  loadStatement: async month => {
    const userId = get().ownerUserId;
    if (!userId) return;
    set({statementError: null, statementLoading: true});
    try {
      const result = await syncService.loadStatement(userId, month);
      set({
        statement: result.statement,
        summary: summaryFromStatement(result.statement),
        selectedMonth: month,
        offline: result.offline,
        statementError: null,
        statementLoading: false,
      });
    } catch (error) {
      set({
        statementError: error instanceof Error ? error.message : 'Unable to load this statement.',
        statementLoading: false,
      });
    }
  },
  createProfile: async input => {
    const userId = get().ownerUserId;
    if (!userId) throw new Error('Sign in before creating a milk profile.');
    set({loading: true, error: null});
    try {
      await syncService.createMilkProfile(userId, input);
      await get().load(userId, get().ownerTimezone);
    } catch (error) {
      set({loading: false, error: error instanceof Error ? error.message : 'Unable to save the profile.'});
      throw error;
    }
  },
  updateProfile: async (profile, effectiveDate) => {
    const userId = get().ownerUserId;
    if (!userId) throw new Error('Sign in before updating milk settings.');
    set({loading: true, error: null});
    try {
      const current = get().profile;
      if (!current) throw new Error('The active milk profile is not available.');
      const patch: {
        name?: string;
        defaultQuantityMl?: number;
        pricePerLitrePaise?: number;
        startDate?: string;
        expectedStartDate?: string;
        quantityEffectiveDate?: string;
        priceEffectiveDate?: string;
      } = {};
      if (profile.name !== current.name) patch.name = profile.name;
      if (profile.defaultQuantityMl !== current.defaultQuantityMl) {
        patch.defaultQuantityMl = profile.defaultQuantityMl;
        patch.quantityEffectiveDate = effectiveDate;
      }
      if (profile.pricePerLitrePaise !== current.pricePerLitrePaise) {
        patch.pricePerLitrePaise = profile.pricePerLitrePaise;
        patch.priceEffectiveDate = effectiveDate;
      }
      if (profile.startDate !== current.startDate) {
        patch.startDate = profile.startDate;
        patch.expectedStartDate = current.startDate;
      }
      if (Object.keys(patch).length === 0) {
        set({loading: false});
        return;
      }
      const updated = await syncService.updateMilkProfile(userId, {...profile, ...patch}, patch);
      if (updated) applyCachedData(updated, set);
      set({loading: false, error: null});
      const selectedMonth = get().selectedMonth < profile.startDate.slice(0, 7)
        ? profile.startDate.slice(0, 7)
        : get().selectedMonth;
      if (selectedMonth !== get().selectedMonth) set({selectedMonth});
      const [monthResult, statementResult] = await Promise.all([
        syncService.loadMonthEntries(userId, selectedMonth),
        syncService.loadStatement(userId, selectedMonth),
      ]);
      applyCachedData(await loadCloudData(userId), set);
      set({
        statement: statementResult.statement,
        summary: summaryFromStatement(statementResult.statement),
        selectedMonth,
        offline: monthResult.offline || statementResult.offline,
      });
    } catch (error) {
      set({loading: false, error: error instanceof Error ? error.message : 'Unable to update settings.'});
      throw error;
    }
  },
  saveEntry: async (date, quantityMl, note) => {
    const {profile, ownerUserId} = get();
    if (!profile || !ownerUserId) throw new Error('Set up a milk profile before saving entries.');
    await syncService.saveMilkEntry(ownerUserId, profile, date, quantityMl, note);
    const cached = await loadCloudData(ownerUserId);
    applyCachedData(cached, set);
    await get().refreshSummary();
  },
  resetEntry: async date => {
    const {profile, ownerUserId} = get();
    if (!profile || !ownerUserId) throw new Error('Set up a milk profile before resetting entries.');
    await syncService.resetMilkEntry(ownerUserId, profile, date);
    const cached = await loadCloudData(ownerUserId);
    applyCachedData(cached, set);
    await get().refreshSummary();
  },
  setSelectedMonth: async month => {
    set({selectedMonth: month});
    await Promise.all([get().loadMonth(month), get().loadStatement(month)]);
  },
  refreshSummary: async () => {
    const {ownerUserId, selectedMonth} = get();
    if (!ownerUserId) return;
    await get().loadStatement(selectedMonth);
  },
}));
