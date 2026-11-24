import {getDatabase} from '../index';
import {MilkEntry, MilkProfile, PriceHistory, QuantityHistory} from '../../types/milk.types';

const now = () => new Date().toISOString();

function profileFromRow(row: any): MilkProfile {
  return {
    id: row.id,
    name: row.name,
    defaultQuantityMl: row.default_quantity_ml,
    pricePerLitrePaise: row.price_per_litre_paise,
    startDate: row.start_date,
    isActive: Boolean(row.is_active),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function getActiveProfile(): Promise<MilkProfile | null> {
  const db = await getDatabase();
  const result = await db.execute(
    'SELECT * FROM milk_profiles WHERE is_active = 1 LIMIT 1',
  );
  return result.rows.length ? profileFromRow(result.rows[0]) : null;
}

export async function createProfile(profile: {
  name: string;
  defaultQuantityMl: number;
  pricePerLitrePaise: number;
  startDate: string;
}): Promise<MilkProfile> {
  const db = await getDatabase();
  const timestamp = now();
  await db.transaction(async tx => {
    await tx.execute('UPDATE milk_profiles SET is_active = 0');
    const insert = await tx.execute(
      `INSERT INTO milk_profiles
       (name, default_quantity_ml, price_per_litre_paise, start_date, is_active, created_at, updated_at)
       VALUES (?, ?, ?, ?, 1, ?, ?)`,
      [profile.name, profile.defaultQuantityMl, profile.pricePerLitrePaise, profile.startDate, timestamp, timestamp],
    );
    const id = insert.insertId as number;
    await tx.execute(
      `INSERT INTO milk_price_history
       (milk_profile_id, price_per_litre_paise, effective_date, created_at)
       VALUES (?, ?, ?, ?)`,
      [id, profile.pricePerLitrePaise, profile.startDate, timestamp],
    );
    await tx.execute(
      `INSERT INTO milk_quantity_history
       (milk_profile_id, default_quantity_ml, effective_date, created_at)
       VALUES (?, ?, ?, ?)`,
      [id, profile.defaultQuantityMl, profile.startDate, timestamp],
    );
  });
  return (await getActiveProfile()) as MilkProfile;
}

export async function updateProfile(profile: MilkProfile, quantityEffectiveDate: string, priceEffectiveDate: string) {
  const db = await getDatabase();
  const timestamp = now();
  await db.transaction(async tx => {
    await tx.execute(
      `UPDATE milk_profiles SET name = ?, default_quantity_ml = ?, price_per_litre_paise = ?, updated_at = ? WHERE id = ?`,
      [profile.name, profile.defaultQuantityMl, profile.pricePerLitrePaise, timestamp, profile.id],
    );
    await tx.execute(
      `INSERT INTO milk_price_history
       (milk_profile_id, price_per_litre_paise, effective_date, created_at)
       VALUES (?, ?, ?, ?)`,
      [profile.id, profile.pricePerLitrePaise, priceEffectiveDate, timestamp],
    );
    await tx.execute(
      `INSERT INTO milk_quantity_history
       (milk_profile_id, default_quantity_ml, effective_date, created_at)
       VALUES (?, ?, ?, ?)`,
      [profile.id, profile.defaultQuantityMl, quantityEffectiveDate, timestamp],
    );
  });
}

export async function getEntries(profileId: number): Promise<MilkEntry[]> {
  const db = await getDatabase();
  const result = await db.execute(
    'SELECT * FROM milk_entries WHERE milk_profile_id = ?',
    [profileId],
  );
  return result.rows.map(row => ({
    id: row.id as number,
    milkProfileId: row.milk_profile_id as number,
    entryDate: row.entry_date as string,
    quantityMl: row.quantity_ml as number,
    note: row.note as string | null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  }));
}

export async function getEntry(profileId: number, date: string): Promise<MilkEntry | null> {
  const db = await getDatabase();
  const result = await db.execute(
    'SELECT * FROM milk_entries WHERE milk_profile_id = ? AND entry_date = ? LIMIT 1',
    [profileId, date],
  );
  if (!result.rows.length) return null;
  const row = result.rows[0];
  return {
    id: row.id as number,
    milkProfileId: row.milk_profile_id as number,
    entryDate: row.entry_date as string,
    quantityMl: row.quantity_ml as number,
    note: row.note as string | null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

export async function saveEntry(profileId: number, date: string, quantityMl: number, note?: string) {
  if (!Number.isInteger(quantityMl) || quantityMl < 0) throw new Error('Quantity must be a valid non-negative value');
  const db = await getDatabase();
  const timestamp = now();
  await db.execute(
    `INSERT INTO milk_entries (milk_profile_id, entry_date, quantity_ml, note, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(milk_profile_id, entry_date)
     DO UPDATE SET quantity_ml = excluded.quantity_ml, note = excluded.note, updated_at = excluded.updated_at`,
    [profileId, date, quantityMl, note?.trim() || null, timestamp, timestamp],
  );
}

export async function deleteEntry(profileId: number, date: string) {
  const db = await getDatabase();
  await db.execute(
    'DELETE FROM milk_entries WHERE milk_profile_id = ? AND entry_date = ?',
    [profileId, date],
  );
}

export async function getPriceHistory(profileId: number): Promise<PriceHistory[]> {
  const db = await getDatabase();
  const result = await db.execute(
    'SELECT * FROM milk_price_history WHERE milk_profile_id = ? ORDER BY effective_date',
    [profileId],
  );
  return result.rows.map(row => ({
    id: row.id as number,
    milkProfileId: row.milk_profile_id as number,
    pricePerLitrePaise: row.price_per_litre_paise as number,
    effectiveDate: row.effective_date as string,
    createdAt: row.created_at as string,
  }));
}

export async function getQuantityHistory(profileId: number): Promise<QuantityHistory[]> {
  const db = await getDatabase();
  const result = await db.execute(
    'SELECT * FROM milk_quantity_history WHERE milk_profile_id = ? ORDER BY effective_date',
    [profileId],
  );
  return result.rows.map(row => ({
    id: row.id as number,
    milkProfileId: row.milk_profile_id as number,
    defaultQuantityMl: row.default_quantity_ml as number,
    effectiveDate: row.effective_date as string,
    createdAt: row.created_at as string,
  }));
}
