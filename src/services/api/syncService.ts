import * as legacyRepository from '../../database/repositories/milkRepository';
import {
  cacheCloudEntries,
  cacheCloudProfile,
  cacheStatement,
  CloudProfile,
  getCachedStatement,
  getCloudProfileId,
  getLegacyImportOwner,
  loadCloudData,
  markLegacyImport,
} from '../../database/cloudCache';
import {getApiBaseUrl} from './apiConfig';
import {ApiError} from './apiClient';
import * as milkApi from './milkApiService';
import {LegacyImportData} from './milkApiService';
import {MilkProfile} from '../../types/milk.types';

function monthAt(date: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {timeZone: timezone, year: 'numeric', month: '2-digit'}).formatToParts(date);
  return `${parts.find(part => part.type === 'year')?.value}-${parts.find(part => part.type === 'month')?.value}`;
}

export function isNetworkFailure(error: unknown): boolean {
  return error instanceof TypeError || (error instanceof ApiError && error.status >= 500);
}

async function activeCloudProfile(userId: string): Promise<CloudProfile | null> {
  const profiles = await milkApi.listProfiles();
  const active = profiles.find(profile => profile.isActive);
  if (!active) return null;
  await cacheCloudProfile(userId, active);
  return active;
}

export async function syncOnLogin(userId: string, timezone: string) {
  const profile = await activeCloudProfile(userId);
  if (!profile) return {profile: null, offline: false};
  const currentMonth = monthAt(new Date(), timezone);
  await Promise.all([
    refreshMonthEntries(userId, profile.id, currentMonth),
    refreshStatement(userId, currentMonth),
  ]);
  return {profile: await loadCloudData(userId), offline: false};
}

export async function refreshMonthEntries(userId: string, cloudProfileId: string, month: string): Promise<void> {
  const entries = await milkApi.getEntries(month);
  await cacheCloudEntries(userId, cloudProfileId, month, entries);
}

export async function loadMonthEntries(userId: string, month: string): Promise<{offline: boolean}> {
  const profileId = await getCloudProfileId(userId);
  if (!profileId) throw new Error('No milk profile is available for this account.');
  try {
    await refreshMonthEntries(userId, profileId, month);
    return {offline: false};
  } catch (error) {
    if (!isNetworkFailure(error)) throw error;
    const data = await loadCloudData(userId);
    if (!data) throw error;
    return {offline: true};
  }
}

async function refreshStatement(userId: string, month: string): Promise<milkApi.MilkStatement> {
  const statement = await milkApi.getStatement(month);
  await cacheStatement(userId, month, statement);
  return statement;
}

export async function loadStatement(
  userId: string,
  month: string,
): Promise<{statement: milkApi.MilkStatement; offline: boolean}> {
  try {
    return {statement: await refreshStatement(userId, month), offline: false};
  } catch (error) {
    if (!isNetworkFailure(error)) throw error;
    const cached = await getCachedStatement<milkApi.MilkStatement>(userId, month);
    if (!cached) throw error;
    return {statement: cached, offline: true};
  }
}

export async function loadCachedData(userId: string) {
  return loadCloudData(userId);
}

export async function createMilkProfile(
  userId: string,
  profile: {name: string; defaultQuantityMl: number; pricePerLitrePaise: number; startDate: string},
) {
  const remote = await milkApi.createProfile(profile);
  await cacheCloudProfile(userId, remote);
  return loadCloudData(userId);
}

export async function updateMilkProfile(
  userId: string,
  profile: MilkProfile,
  changes: {
    name?: string;
    defaultQuantityMl?: number;
    pricePerLitrePaise?: number;
    startDate?: string;
    expectedStartDate?: string;
    quantityEffectiveDate?: string;
    priceEffectiveDate?: string;
  },
) {
  if (!profile.cloudId) throw new Error('The active milk profile is not linked to the signed-in account.');
  const remote = await milkApi.updateProfile(profile.cloudId, changes);
  await cacheCloudProfile(userId, remote);
  return loadCloudData(userId);
}

export async function saveMilkEntry(
  userId: string,
  profile: MilkProfile,
  date: string,
  quantityMl: number,
  note?: string,
) {
  if (!profile.cloudId) throw new Error('The active milk profile is not linked to the signed-in account.');
  const month = date.slice(0, 7);
  await refreshMonthEntries(userId, profile.cloudId, month);
  const data = await loadCloudData(userId);
  const current = data?.entries.find(entry => entry.entryDate === date);
  const entry = await milkApi.saveEntry(date, quantityMl, note ?? '', current?.version ?? 0);
  const monthEntries = (data?.entries ?? [])
    .filter(item => item.entryDate.slice(0, 7) === month && item.entryDate !== date)
    .map(item => ({
      entryDate: item.entryDate,
      quantityMl: item.quantityMl,
      note: item.note,
      version: item.version ?? 1,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
    }));
  const updatedEntries = [
    {...entry, version: entry.version ?? 1},
    ...monthEntries,
  ];
  await cacheCloudEntries(userId, profile.cloudId, month, updatedEntries);
}

export async function resetMilkEntry(userId: string, profile: MilkProfile, date: string) {
  if (!profile.cloudId) throw new Error('The active milk profile is not linked to the signed-in account.');
  const month = date.slice(0, 7);
  await refreshMonthEntries(userId, profile.cloudId, month);
  const data = await loadCloudData(userId);
  const current = data?.entries.find(entry => entry.entryDate === date);
  if (!current) return;
  await milkApi.deleteEntry(date, current.version ?? 1);
  const remaining = (data?.entries ?? [])
    .filter(entry => entry.entryDate !== date && entry.entryDate.slice(0, 7) === month)
    .map(entry => ({...entry, version: entry.version ?? 1}));
  await cacheCloudEntries(userId, profile.cloudId, month, remaining);
}

function importSourceKey(data: LegacyImportData): string {
  const serialized = JSON.stringify(data);
  let first = 0x811c9dc5;
  let second = 0x9e3779b9;
  for (let index = 0; index < serialized.length; index += 1) {
    const code = serialized.charCodeAt(index);
    first = Math.imul(first ^ code, 0x01000193);
    second = Math.imul(second ^ code, 0x85ebca6b);
  }
  return `legacy-v1-${(first >>> 0).toString(16)}-${(second >>> 0).toString(16)}-${data.entries.length}`;
}

export async function getLegacyImportData(): Promise<LegacyImportData | null> {
  const profile = await legacyRepository.getActiveProfile();
  if (!profile) return null;
  const [entries, priceHistory, quantityHistory] = await Promise.all([
    legacyRepository.getEntries(profile.id),
    legacyRepository.getPriceHistory(profile.id),
    legacyRepository.getQuantityHistory(profile.id),
  ]);
  return {
    profile: {
      name: profile.name,
      defaultQuantityMl: profile.defaultQuantityMl,
      pricePerLitrePaise: profile.pricePerLitrePaise,
      startDate: profile.startDate,
    },
    priceHistory: priceHistory.map(({pricePerLitrePaise, effectiveDate}) => ({pricePerLitrePaise, effectiveDate})),
    quantityHistory: quantityHistory.map(({defaultQuantityMl, effectiveDate}) => ({defaultQuantityMl, effectiveDate})),
    entries: entries.map(({entryDate, quantityMl, note}) => ({entryDate, quantityMl, note: note ?? ''})),
  };
}

export async function legacyImportOwner(data: LegacyImportData): Promise<string | null> {
  return getLegacyImportOwner(importSourceKey(data));
}

export async function previewImport(data: LegacyImportData) {
  return milkApi.previewLegacyImport(data);
}

export async function importLegacyData(userId: string, data: LegacyImportData) {
  const importKey = importSourceKey(data);
  const response = await milkApi.commitLegacyImport(data, importKey);
  if (!(await getLegacyImportOwner(importKey))) {
    await markLegacyImport(userId, importKey);
  }
  return response.import;
}

export function getConfiguredApiHost(): string {
  return new URL(getApiBaseUrl()).host;
}

export async function currentRemoteProfile(userId: string) {
  const data = await loadCloudData(userId);
  return data?.profile ?? null;
}

export async function refreshProfileFromServer(userId: string) {
  const remote = await activeCloudProfile(userId);
  return remote ? loadCloudData(userId) : null;
}
