import * as SQLite from 'expo-sqlite';
import {
  ARWEAVE_CACHE_DEFAULT_LIMIT,
  ARWEAVE_CACHE_DEFAULT_MAX_AGE_MS,
  ARWEAVE_CACHE_SETTING_ENABLED,
  ARWEAVE_CACHE_SETTING_LIMIT,
  ARWEAVE_CACHE_SETTING_MAX_AGE_MS,
} from './constants';

const DB_NAME = 'oam_arweave_cache.db';

let db: SQLite.SQLiteDatabase | null = null;
let dbInitPromise: Promise<SQLite.SQLiteDatabase> | null = null;
let writeChain: Promise<unknown> = Promise.resolve();

function enqueueWrite<T>(fn: () => Promise<T>): Promise<T> {
  const task = writeChain.then(fn, fn);
  writeChain = task.then(
    () => undefined,
    () => undefined,
  );
  return task;
}

function isDbCorruptionError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes('NullPointerException');
}

async function openAndInit(forceNew: boolean): Promise<SQLite.SQLiteDatabase> {
  const database = await SQLite.openDatabaseAsync(DB_NAME, {
    useNewConnection: forceNew,
  });
  await initSchema(database);
  return database;
}

export async function getArweaveCacheDb(): Promise<SQLite.SQLiteDatabase> {
  if (db) return db;

  if (!dbInitPromise) {
    dbInitPromise = (async () => {
      try {
        const database = await openAndInit(false);
        db = database;
        return database;
      } catch (error) {
        if (!isDbCorruptionError(error)) {
          dbInitPromise = null;
          throw error;
        }
        const database = await openAndInit(true);
        db = database;
        return database;
      }
    })().catch((error) => {
      dbInitPromise = null;
      throw error;
    });
  }

  return dbInitPromise;
}

export async function withArweaveCacheDb<T>(
  fn: (database: SQLite.SQLiteDatabase) => Promise<T>,
): Promise<T> {
  try {
    return await fn(await getArweaveCacheDb());
  } catch (error) {
    if (!isDbCorruptionError(error)) throw error;

    db = null;
    dbInitPromise = openAndInit(true)
      .then((database) => {
        db = database;
        return database;
      })
      .catch((err) => {
        dbInitPromise = null;
        throw err;
      });

    return await fn(await dbInitPromise);
  }
}

export async function withArweaveCacheDbWrite<T>(
  fn: (database: SQLite.SQLiteDatabase) => Promise<T>,
): Promise<T> {
  return enqueueWrite(() => withArweaveCacheDb(fn));
}

export async function initArweaveCacheDatabase(): Promise<void> {
  await getArweaveCacheDb();
}

async function initSchema(database: SQLite.SQLiteDatabase) {
  await database.execAsync(`
    CREATE TABLE IF NOT EXISTS arweave_uploads (
      id TEXT PRIMARY KEY,
      ownerAddress TEXT NOT NULL,
      timestamp INTEGER NOT NULL,
      itemJson TEXT NOT NULL,
      cachedAt INTEGER NOT NULL
    );
  `);

  await database.execAsync(
    'CREATE INDEX IF NOT EXISTS idx_arweave_uploads_owner_ts ON arweave_uploads(ownerAddress, timestamp DESC);',
  );

  await database.execAsync(`
    CREATE TABLE IF NOT EXISTS arweave_cache_settings (
      key TEXT PRIMARY KEY,
      value TEXT
    );
  `);

  await database.execAsync(`
    INSERT OR IGNORE INTO arweave_cache_settings (key, value) VALUES ('${ARWEAVE_CACHE_SETTING_ENABLED}', '1');
  `);
  await database.execAsync(`
    INSERT OR IGNORE INTO arweave_cache_settings (key, value)
    VALUES ('${ARWEAVE_CACHE_SETTING_LIMIT}', '${ARWEAVE_CACHE_DEFAULT_LIMIT}');
  `);
  await database.execAsync(`
    INSERT OR IGNORE INTO arweave_cache_settings (key, value)
    VALUES ('${ARWEAVE_CACHE_SETTING_MAX_AGE_MS}', '${ARWEAVE_CACHE_DEFAULT_MAX_AGE_MS}');
  `);
}

export async function clearAllArweaveCache(): Promise<void> {
  await withArweaveCacheDbWrite(async (database) => {
    await database.execAsync('DELETE FROM arweave_uploads;');
  });
}
