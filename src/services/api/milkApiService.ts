import {apiRequest} from './apiClient';
import {CloudEntry, CloudProfile} from '../../database/cloudCache';

export type StatementRecord = {
  date: string;
  quantityMl: number;
  pricePerLitrePaise: number;
  amountPaise: number;
  isModified: boolean;
  isSkipped: boolean;
  note: string;
  version: number | null;
};

export type MilkStatement = {
  month: string;
  totalQuantityMl: number;
  totalAmountPaise: number;
  skippedDays: number;
  modifiedDays: number;
  status: 'provisional' | 'finalized';
  readOnly: boolean;
  records: StatementRecord[];
};

export type StatementHistoryItem = {
  month: string;
  totalQuantityMl: number;
  totalAmountPaise: number;
  status: 'provisional' | 'finalized';
  readOnly: boolean;
};

export async function listProfiles(): Promise<CloudProfile[]> {
  const result = await apiRequest<{profiles: CloudProfile[]}>('/milk/profiles');
  return result.profiles;
}

export async function createProfile(input: {
  name: string;
  defaultQuantityMl: number;
  pricePerLitrePaise: number;
  startDate: string;
}): Promise<CloudProfile> {
  const result = await apiRequest<{profile: CloudProfile}>('/milk/profiles', {method: 'POST', body: input});
  return result.profile;
}

export async function updateProfile(
  profileId: string,
  input: {
    name?: string;
    defaultQuantityMl?: number;
    pricePerLitrePaise?: number;
    startDate?: string;
    expectedStartDate?: string;
    quantityEffectiveDate?: string;
    priceEffectiveDate?: string;
  },
): Promise<CloudProfile> {
  const result = await apiRequest<{profile: CloudProfile}>(
    `/milk/profiles/${encodeURIComponent(profileId)}`,
    {method: 'PATCH', body: input},
  );
  return result.profile;
}

export async function getEntries(month: string): Promise<CloudEntry[]> {
  const result = await apiRequest<{entries: CloudEntry[]}>(`/milk/entries?month=${encodeURIComponent(month)}`);
  return result.entries;
}

export async function saveEntry(
  date: string,
  quantityMl: number,
  note: string,
  version: number,
): Promise<CloudEntry> {
  const result = await apiRequest<{entry: CloudEntry}>(`/milk/entries/${encodeURIComponent(date)}`, {
    method: 'PUT',
    body: {quantityMl, note, version},
  });
  return result.entry;
}

export async function deleteEntry(date: string, version: number): Promise<void> {
  await apiRequest<{deleted: boolean}>(`/milk/entries/${encodeURIComponent(date)}`, {
    method: 'DELETE',
    body: {version},
  });
}

export async function getStatement(month: string): Promise<MilkStatement> {
  const result = await apiRequest<{statement: MilkStatement}>(`/milk/statements/${encodeURIComponent(month)}`);
  return result.statement;
}

export async function getStatementHistory(page = 1, limit = 24): Promise<{
  page: number;
  limit: number;
  total: number;
  statements: StatementHistoryItem[];
}> {
  return apiRequest(`/milk/statements/history?page=${page}&limit=${limit}`);
}

export async function getBills(page = 1, limit = 24) {
  return apiRequest<{page: number; limit: number; total: number; bills: unknown[]}>(
    `/milk/bills?page=${page}&limit=${limit}`,
  );
}

export async function finalizeBill(month: string) {
  return apiRequest<{bill: unknown}>(`/milk/bills/${encodeURIComponent(month)}/finalize`, {method: 'POST'});
}

export type LegacyImportData = {
  profile: {
    name: string;
    defaultQuantityMl: number;
    pricePerLitrePaise: number;
    startDate: string;
  };
  priceHistory: Array<{pricePerLitrePaise: number; effectiveDate: string}>;
  quantityHistory: Array<{defaultQuantityMl: number; effectiveDate: string}>;
  entries: Array<{entryDate: string; quantityMl: number; note: string}>;
};

export async function previewLegacyImport(data: LegacyImportData) {
  return apiRequest<{preview: {
    profileExists: boolean;
    totalEntries: number;
    duplicateCount: number;
    finalizedMonthCount: number;
    importableCount: number;
    editableWindowCount: number;
    historicalReadOnlyCount: number;
    priceHistoryCount: number;
    quantityHistoryCount: number;
  }}>('/milk/import/preview', {method: 'POST', body: data});
}

export async function commitLegacyImport(data: LegacyImportData, importKey: string) {
  return apiRequest<{import: {
    profileId: string;
    importedCount: number;
    duplicateCount: number;
    skippedFinalizedMonths: number;
    editableWindowCount: number;
    historicalReadOnlyCount: number;
  }}>('/milk/import/commit', {
    method: 'POST',
    body: {...data, importKey, includeHistoricalReadOnly: true},
  });
}
