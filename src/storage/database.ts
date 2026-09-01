import * as SQLite from 'expo-sqlite';

const DB_NAME = 'oam_cache.db';

let db: SQLite.SQLiteDatabase | null = null;
let dbInitPromise: Promise<SQLite.SQLiteDatabase> | null = null;
let writeChain: Promise<unknown> = Promise.resolve();

function enqueueWrite<T>(fn: () => Promise<T>): Promise<T> {
  const task = writeChain.then(fn, fn);
  writeChain = task.then(
    () => undefined,
    () => undefined
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

/**
 * Open the database once and reuse the connection.
 * Uses a promise lock so concurrent callers share the same init.
 */
export async function getDb(): Promise<SQLite.SQLiteDatabase> {
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

/**
 * Run a DB operation; on Android NPE from a poisoned handle, reopen once and retry.
 */
export async function withDb<T>(
  fn: (database: SQLite.SQLiteDatabase) => Promise<T>
): Promise<T> {
  try {
    return await fn(await getDb());
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

/**
 * Serialize write operations — SQLite allows only one writer at a time.
 */
export async function withDbWrite<T>(
  fn: (database: SQLite.SQLiteDatabase) => Promise<T>
): Promise<T> {
  return enqueueWrite(() => withDb(fn));
}

/** Eager init — call once at app startup before any cache reads/writes. */
export async function initDatabase(): Promise<void> {
  await getDb();
}

async function initSchema(database: SQLite.SQLiteDatabase) {
  await database.execAsync(`
    CREATE TABLE IF NOT EXISTS transactions (
      hash TEXT PRIMARY KEY,
      fromAddress TEXT,
      toAddress TEXT,
      input TEXT,
      value TEXT,
      timestamp INTEGER,
      blockNumber TEXT,
      gas TEXT,
      gasPrice TEXT,
      gasUsed TEXT,
      nonce TEXT,
      transactionIndex TEXT,
      isError INTEGER,
      methodId TEXT,
      contractAddress TEXT,
      rawJson TEXT
    );
  `);

  await database.execAsync(`
    CREATE TABLE IF NOT EXISTS address_tx_map (
      address TEXT,
      txHash TEXT,
      PRIMARY KEY (address, txHash),
      FOREIGN KEY (txHash) REFERENCES transactions (hash) ON DELETE CASCADE
    );
  `);
  await database.execAsync(
    'CREATE INDEX IF NOT EXISTS idx_address_tx_map_address ON address_tx_map(address);'
  );

  await database.execAsync(`
    CREATE TABLE IF NOT EXISTS cache_configs (
      address TEXT PRIMARY KEY,
      limitCount INTEGER DEFAULT 100,
      isEnabled INTEGER DEFAULT 1
    );
  `);

  await database.execAsync(`
    CREATE TABLE IF NOT EXISTS global_settings (
      key TEXT PRIMARY KEY,
      value TEXT
    );
  `);
  await database.execAsync(`
    INSERT OR IGNORE INTO global_settings (key, value) VALUES ('cache_enabled', '1');
  `);
  await database.execAsync(`
    INSERT OR IGNORE INTO global_settings (key, value) VALUES ('default_limit', '100');
  `);
}

/**
 * Clear all cache data
 */
export async function clearAllCache(): Promise<void> {
  await withDbWrite(async (database) => {
    await database.execAsync('DELETE FROM address_tx_map;');
    await database.execAsync('DELETE FROM transactions;');
  });
}
