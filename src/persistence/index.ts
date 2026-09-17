import fs from 'node:fs/promises';
import path from 'node:path';
import { openDatabase, type Database } from './db';
import { currentVersion, runMigrations } from './migrations';
import { importLegacyJsonFiles } from './importLegacyJson';

export type { Database } from './db';
export { openDatabase, openInMemoryDatabase } from './db';

/**
 * Where runtime state lives.
 *
 * Resolved from the working directory rather than `__dirname`. The old
 * `path.join(__dirname, '..', 'data')` only worked by accident of the bundle
 * layout - `dist/../data` under esbuild and `src/../data` under tsx happen to
 * land in the same place - which would have broken the moment the output moved.
 * `process.cwd()` is /usr/src/app in the container (the Dockerfile WORKDIR, and
 * what the compose volume mounts onto) and the repo root in development.
 */
export function resolveDataDir(): string {
    return process.env.LAFAYETTE_DATA_DIR ?? path.resolve(process.cwd(), 'data');
}

export interface PersistenceHandle {
    readonly db: Database;
    close(): void;
}

let handle: PersistenceHandle | null = null;

/**
 * Opens the database, migrates it, and imports the legacy JSON files the first
 * time it is created.
 *
 * The "is this brand new" check reads `PRAGMA user_version` *before* migrating,
 * because migrating is what sets it. Importing only on a fresh database is what
 * makes this safe to run on every boot.
 */
export async function initPersistence(dataDir: string = resolveDataDir()): Promise<PersistenceHandle> {
    await fs.mkdir(dataDir, { recursive: true });

    const filePath = path.join(dataDir, 'lafayette.db');
    const db = openDatabase(filePath);

    const wasEmpty = currentVersion(db) === 0;
    const version = runMigrations(db);
    console.log(`[DB] Ready at ${filePath} (schema v${version}).`);

    if (wasEmpty) {
        try {
            const report = await importLegacyJsonFiles(db, dataDir);
            if (report.settingsFileFound || report.stateFileFound) {
                console.log(
                    `[DB] Imported legacy JSON: ${report.guildsImported} guild(s), ` +
                    `${report.userSettingsImported} user setting(s), ${report.decksImported} deck(s)` +
                    (report.decksSkipped ? `, ${report.decksSkipped} deck(s) skipped` : '') + '.',
                );
                for (const warning of report.warnings) {
                    console.warn(`[DB] ${warning}`);
                }
                console.log('[DB] Legacy files renamed to *.imported-<timestamp>; delete them once happy.');
            } else {
                console.log('[DB] No legacy JSON files to import.');
            }
        } catch (error) {
            // A failed import must not take the bot down: the database is valid
            // and empty, and the legacy files are still on disk untouched.
            console.error('[DB] Legacy import failed; continuing with an empty database:', error);
        }
    }

    handle = {
        db,
        close() {
            db.close();
            handle = null;
        },
    };

    return handle;
}

/** The open database. Throws if `initPersistence` has not run yet. */
export function getDb(): Database {
    if (!handle) {
        throw new Error('[DB] Persistence has not been initialised. Call initPersistence() first.');
    }
    return handle.db;
}

/** Closes the database if one is open. Safe to call more than once. */
export function closePersistence(): void {
    handle?.close();
}
