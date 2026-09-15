import { Platform } from 'react-native';
import * as SQLite from 'expo-sqlite';

type SQLiteOpenOptions = NonNullable<Parameters<typeof SQLite.openDatabaseAsync>[1]>;

export function isDbCorruptionError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes('NullPointerException');
}

export function isSqliteOpenError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return (
    message.includes('Error code 14') ||
    message.includes('unable to open database') ||
    message.includes('cannot create file')
  );
}

export async function openDatabaseWithWebFallback(
  dbName: string,
  initSchema: (database: SQLite.SQLiteDatabase) => Promise<void>,
  options: SQLiteOpenOptions = {},
): Promise<SQLite.SQLiteDatabase> {
  const open = async (name: string, forceNew: boolean) => {
    const database = await SQLite.openDatabaseAsync(name, {
      ...options,
      useNewConnection: forceNew,
    });
    await initSchema(database);
    return database;
  };

  try {
    return await open(dbName, options.useNewConnection ?? false);
  } catch (error) {
    if (isDbCorruptionError(error)) {
      return open(dbName, true);
    }

    if (Platform.OS !== 'web' || !isSqliteOpenError(error)) {
      throw error;
    }

    try {
      await SQLite.deleteDatabaseAsync(dbName);
    } catch {
      // Ignore cleanup errors and retry with a fresh connection.
    }

    try {
      return await open(dbName, true);
    } catch (retryError) {
      if (!isSqliteOpenError(retryError)) {
        throw retryError;
      }

      console.warn(
        `[sqlite] Web persistent storage unavailable for ${dbName}, using in-memory cache.`,
      );
      return open(':memory:', true);
    }
  }
}
