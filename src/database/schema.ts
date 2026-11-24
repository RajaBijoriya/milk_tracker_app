export const SCHEMA_VERSION = 2;

export const SCHEMA_STATEMENTS = [
`CREATE TABLE IF NOT EXISTS milk_profiles (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 name TEXT NOT NULL,
 default_quantity_ml INTEGER NOT NULL,
 price_per_litre_paise INTEGER NOT NULL,
 start_date TEXT NOT NULL,
 is_active INTEGER NOT NULL DEFAULT 1,
 created_at TEXT NOT NULL,
 updated_at TEXT NOT NULL
)`,
`CREATE TABLE IF NOT EXISTS milk_entries (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 milk_profile_id INTEGER NOT NULL,
 entry_date TEXT NOT NULL,
 quantity_ml INTEGER NOT NULL CHECK(quantity_ml >= 0),
 note TEXT,
 created_at TEXT NOT NULL,
 updated_at TEXT NOT NULL,
 UNIQUE(milk_profile_id, entry_date),
 FOREIGN KEY(milk_profile_id) REFERENCES milk_profiles(id) ON DELETE CASCADE
)`,
`CREATE TABLE IF NOT EXISTS milk_price_history (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 milk_profile_id INTEGER NOT NULL,
 price_per_litre_paise INTEGER NOT NULL CHECK(price_per_litre_paise >= 0),
 effective_date TEXT NOT NULL,
 created_at TEXT NOT NULL,
 FOREIGN KEY(milk_profile_id) REFERENCES milk_profiles(id) ON DELETE CASCADE
)`,
`CREATE TABLE IF NOT EXISTS milk_quantity_history (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 milk_profile_id INTEGER NOT NULL,
 default_quantity_ml INTEGER NOT NULL CHECK(default_quantity_ml >= 0),
 effective_date TEXT NOT NULL,
 created_at TEXT NOT NULL,
 FOREIGN KEY(milk_profile_id) REFERENCES milk_profiles(id) ON DELETE CASCADE
)`,
`CREATE TABLE IF NOT EXISTS monthly_bills (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 milk_profile_id INTEGER NOT NULL,
 bill_month TEXT NOT NULL,
 total_quantity_ml INTEGER NOT NULL,
 total_amount_paise INTEGER NOT NULL,
 status TEXT NOT NULL,
 finalized_at TEXT,
 created_at TEXT NOT NULL,
 UNIQUE(milk_profile_id, bill_month),
 FOREIGN KEY(milk_profile_id) REFERENCES milk_profiles(id) ON DELETE CASCADE
)`,
`CREATE UNIQUE INDEX IF NOT EXISTS uq_active_profile ON milk_profiles(is_active) WHERE is_active = 1`,
`CREATE TABLE IF NOT EXISTS cloud_milk_profiles (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 user_id TEXT NOT NULL,
 cloud_profile_id TEXT NOT NULL,
 name TEXT NOT NULL,
 default_quantity_ml INTEGER NOT NULL,
 price_per_litre_paise INTEGER NOT NULL,
 start_date TEXT NOT NULL,
 is_active INTEGER NOT NULL DEFAULT 1,
 created_at TEXT NOT NULL,
 updated_at TEXT NOT NULL,
 UNIQUE(user_id, cloud_profile_id)
)`,
`CREATE UNIQUE INDEX IF NOT EXISTS uq_cloud_active_profile ON cloud_milk_profiles(user_id) WHERE is_active = 1`,
`CREATE TABLE IF NOT EXISTS cloud_milk_entries (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 user_id TEXT NOT NULL,
 cloud_profile_id TEXT NOT NULL,
 entry_date TEXT NOT NULL,
 quantity_ml INTEGER NOT NULL CHECK(quantity_ml >= 0),
 note TEXT,
 version INTEGER NOT NULL DEFAULT 1,
 created_at TEXT NOT NULL,
 updated_at TEXT NOT NULL,
 UNIQUE(user_id, cloud_profile_id, entry_date)
)`,
`CREATE INDEX IF NOT EXISTS idx_cloud_entries_user_month ON cloud_milk_entries(user_id, cloud_profile_id, entry_date)`,
`CREATE TABLE IF NOT EXISTS cloud_price_history (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 user_id TEXT NOT NULL,
 cloud_profile_id TEXT NOT NULL,
 price_per_litre_paise INTEGER NOT NULL CHECK(price_per_litre_paise >= 0),
 effective_date TEXT NOT NULL,
 created_at TEXT NOT NULL,
 UNIQUE(user_id, cloud_profile_id, effective_date)
)`,
`CREATE TABLE IF NOT EXISTS cloud_quantity_history (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 user_id TEXT NOT NULL,
 cloud_profile_id TEXT NOT NULL,
 default_quantity_ml INTEGER NOT NULL CHECK(default_quantity_ml >= 0),
 effective_date TEXT NOT NULL,
 created_at TEXT NOT NULL,
 UNIQUE(user_id, cloud_profile_id, effective_date)
)`,
`CREATE TABLE IF NOT EXISTS cached_statements (
 user_id TEXT NOT NULL,
 bill_month TEXT NOT NULL,
 payload TEXT NOT NULL,
 updated_at TEXT NOT NULL,
 PRIMARY KEY(user_id, bill_month)
)`,
`CREATE TABLE IF NOT EXISTS legacy_import_receipts (
 source_key TEXT PRIMARY KEY,
 owner_user_id TEXT NOT NULL,
 imported_at TEXT NOT NULL
)`,
];
// Database metadata is initialized by database/index.ts.