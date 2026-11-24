import {open, DB} from '@op-engineering/op-sqlite';
import {SCHEMA_STATEMENTS, SCHEMA_VERSION} from './schema';

let databasePromise: Promise<DB> | null = null;

export async function getDatabase(): Promise<DB> {
  if (!databasePromise) {
    databasePromise = Promise.resolve().then(async () => {
      const db = open({name: 'milktracker.db', location: 'Documents'});
      await db.execute('PRAGMA foreign_keys = ON');
      await db.execute(
        'CREATE TABLE IF NOT EXISTS schema_metadata (version INTEGER PRIMARY KEY)',
      );
      await db.executeBatch(SCHEMA_STATEMENTS.map(statement => [statement] as [string]));
      await db.execute(
        'INSERT OR IGNORE INTO schema_metadata(version) VALUES (?)',
        [SCHEMA_VERSION],
      );
      return db;
    }).catch(error => {
      databasePromise = null;
      throw error;
    });
  }
  return databasePromise;
}
