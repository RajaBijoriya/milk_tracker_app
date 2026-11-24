import {getDatabase} from './index';
import {MilkEntry, MilkProfile, PriceHistory, QuantityHistory} from '../types/milk.types';

export type CloudProfile = {
  id: string;
  name: string;
  defaultQuantityMl: number;
  pricePerLitrePaise: number;
  startDate: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  priceHistory: Array<{
    id?: string;
    pricePerLitrePaise: number;
    effectiveDate: string;
    createdAt?: string;
  }>;
  quantityHistory: Array<{
    id?: string;
    defaultQuantityMl: number;
    effectiveDate: string;
    createdAt?: string;
  }>;
};

export type CloudEntry = {
  _id?: string;
  id?: string | number;
  entryDate: string;
  quantityMl: number;
  note?: string | null;
  version: number;
  createdAt?: string;
  updatedAt?: string;
};

type CloudData = {
  profile: MilkProfile;
  cloudProfileId: string;
  entries: MilkEntry[];
  priceHistory: PriceHistory[];
  quantityHistory: QuantityHistory[];
};

const now = () => new Date().toISOString();

export async function cacheCloudProfile(userId: string, remote: CloudProfile): Promise<number> {
  const db = await getDatabase();
  const timestamp = now();
  await db.transaction(async tx => {
    await tx.execute('UPDATE cloud_milk_profiles SET is_active = 0 WHERE user_id = ?', [userId]);
    const existing = await tx.execute(
      'SELECT id FROM cloud_milk_profiles WHERE user_id = ? AND cloud_profile_id = ? LIMIT 1',
      [userId, remote.id],
    );
    let localId = existing.rows.length ? Number(existing.rows[0].id) : 0;
    if (localId) {
      await tx.execute(
        `UPDATE cloud_milk_profiles
         SET name = ?, default_quantity_ml = ?, price_per_litre_paise = ?, start_date = ?,
             is_active = ?, updated_at = ?
         WHERE user_id = ? AND id = ?`,
        [remote.name, remote.defaultQuantityMl, remote.pricePerLitrePaise, remote.startDate, remote.isActive ? 1 : 0, remote.updatedAt || timestamp, userId, localId],
      );
    } else {
      const inserted = await tx.execute(
        `INSERT INTO cloud_milk_profiles
         (user_id, cloud_profile_id, name, default_quantity_ml, price_per_litre_paise,
          start_date, is_active, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [userId, remote.id, remote.name, remote.defaultQuantityMl, remote.pricePerLitrePaise,
          remote.startDate, remote.isActive ? 1 : 0, remote.createdAt || timestamp, remote.updatedAt || timestamp],
      );
      localId = Number(inserted.insertId);
    }

    await tx.execute('DELETE FROM cloud_price_history WHERE user_id = ? AND cloud_profile_id = ?', [userId, remote.id]);
    await tx.execute('DELETE FROM cloud_quantity_history WHERE user_id = ? AND cloud_profile_id = ?', [userId, remote.id]);
    for (const item of remote.priceHistory) {
      await tx.execute(
        `INSERT INTO cloud_price_history
         (user_id, cloud_profile_id, price_per_litre_paise, effective_date, created_at)
         VALUES (?, ?, ?, ?, ?)`,
        [userId, remote.id, item.pricePerLitrePaise, item.effectiveDate, item.createdAt || timestamp],
      );
    }
    for (const item of remote.quantityHistory) {
      await tx.execute(
        `INSERT INTO cloud_quantity_history
         (user_id, cloud_profile_id, default_quantity_ml, effective_date, created_at)
         VALUES (?, ?, ?, ?, ?)`,
        [userId, remote.id, item.defaultQuantityMl, item.effectiveDate, item.createdAt || timestamp],
      );
    }
  });
  const cached = await db.execute(
    'SELECT id FROM cloud_milk_profiles WHERE user_id = ? AND cloud_profile_id = ? LIMIT 1',
    [userId, remote.id],
  );
  if (!cached.rows.length) throw new Error('Unable to read the cached milk profile after synchronization.');
  return Number(cached.rows[0].id);
}

export async function getCloudProfileId(userId: string): Promise<string | null> {
  const db = await getDatabase();
  const result = await db.execute(
    'SELECT cloud_profile_id FROM cloud_milk_profiles WHERE user_id = ? AND is_active = 1 LIMIT 1',
    [userId],
  );
  return result.rows.length ? String(result.rows[0].cloud_profile_id) : null;
}

export async function cacheCloudEntries(
  userId: string,
  cloudProfileId: string,
  month: string,
  entries: CloudEntry[],
): Promise<void> {
  const db = await getDatabase();
  const start = `${month}-01`;
  const end = `${month}-31`;
  const timestamp = now();
  await db.transaction(async tx => {
    await tx.execute(
      `DELETE FROM cloud_milk_entries
       WHERE user_id = ? AND cloud_profile_id = ? AND entry_date >= ? AND entry_date <= ?`,
      [userId, cloudProfileId, start, end],
    );
    for (const entry of entries) {
      await tx.execute(
        `INSERT INTO cloud_milk_entries
         (user_id, cloud_profile_id, entry_date, quantity_ml, note, version, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          userId, cloudProfileId, entry.entryDate, entry.quantityMl, entry.note ?? '',
          entry.version, entry.createdAt || timestamp, entry.updatedAt || timestamp,
        ],
      );
    }
  });
}

export async function cacheStatement(userId: string, month: string, statement: unknown): Promise<void> {
  const db = await getDatabase();
  await db.execute(
    `INSERT INTO cached_statements (user_id, bill_month, payload, updated_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(user_id, bill_month)
     DO UPDATE SET payload = excluded.payload, updated_at = excluded.updated_at`,
    [userId, month, JSON.stringify(statement), now()],
  );
}

export async function getCachedStatement<T>(userId: string, month: string): Promise<T | null> {
  const db = await getDatabase();
  const result = await db.execute(
    'SELECT payload FROM cached_statements WHERE user_id = ? AND bill_month = ? LIMIT 1',
    [userId, month],
  );
  if (!result.rows.length) return null;
  return JSON.parse(String(result.rows[0].payload)) as T;
}

export async function loadCloudData(userId: string): Promise<CloudData | null> {
  const db = await getDatabase();
  const profiles = await db.execute(
    'SELECT * FROM cloud_milk_profiles WHERE user_id = ? AND is_active = 1 LIMIT 1',
    [userId],
  );
  if (!profiles.rows.length) return null;
  const row = profiles.rows[0];
  const cloudProfileId = String(row.cloud_profile_id);
  const [entryRows, priceRows, quantityRows] = await Promise.all([
    db.execute('SELECT * FROM cloud_milk_entries WHERE user_id = ? AND cloud_profile_id = ? ORDER BY entry_date', [userId, cloudProfileId]),
    db.execute('SELECT * FROM cloud_price_history WHERE user_id = ? AND cloud_profile_id = ? ORDER BY effective_date', [userId, cloudProfileId]),
    db.execute('SELECT * FROM cloud_quantity_history WHERE user_id = ? AND cloud_profile_id = ? ORDER BY effective_date', [userId, cloudProfileId]),
  ]);
  const profile: MilkProfile = {
    id: Number(row.id),
    cloudId: cloudProfileId,
    name: String(row.name),
    defaultQuantityMl: Number(row.default_quantity_ml),
    pricePerLitrePaise: Number(row.price_per_litre_paise),
    startDate: String(row.start_date),
    isActive: Boolean(row.is_active),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
  const entries: MilkEntry[] = entryRows.rows.map(entry => ({
    id: Number(entry.id),
    cloudId: `entry:${entry.entry_date}`,
    milkProfileId: profile.id,
    entryDate: String(entry.entry_date),
    quantityMl: Number(entry.quantity_ml),
    note: (entry.note as string | null) ?? null,
    version: Number(entry.version),
    createdAt: String(entry.created_at),
    updatedAt: String(entry.updated_at),
  }));
  const priceHistory: PriceHistory[] = priceRows.rows.map(item => ({
    id: Number(item.id),
    milkProfileId: profile.id,
    pricePerLitrePaise: Number(item.price_per_litre_paise),
    effectiveDate: String(item.effective_date),
    createdAt: String(item.created_at),
  }));
  const quantityHistory: QuantityHistory[] = quantityRows.rows.map(item => ({
    id: Number(item.id),
    milkProfileId: profile.id,
    defaultQuantityMl: Number(item.default_quantity_ml),
    effectiveDate: String(item.effective_date),
    createdAt: String(item.created_at),
  }));
  return {profile, cloudProfileId, entries, priceHistory, quantityHistory};
}

export async function getLegacyImportOwner(sourceKey: string): Promise<string | null> {
  const db = await getDatabase();
  const result = await db.execute('SELECT owner_user_id FROM legacy_import_receipts WHERE source_key = ? LIMIT 1', [sourceKey]);
  return result.rows.length ? String(result.rows[0].owner_user_id) : null;
}

export async function markLegacyImport(userId: string, sourceKey: string): Promise<void> {
  const db = await getDatabase();
  await db.execute(
    'INSERT INTO legacy_import_receipts (source_key, owner_user_id, imported_at) VALUES (?, ?, ?)',
    [sourceKey, userId, now()],
  );
}

export async function cacheLegacyImportReceipt(userId: string, sourceKey: string): Promise<void> {
  await markLegacyImport(userId, sourceKey);
}
